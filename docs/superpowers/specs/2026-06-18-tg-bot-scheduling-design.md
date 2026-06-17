# Отложки во вкладке «тг бот» (рассылка + будущие турниры)

Дата: 2026-06-18
Статус: согласован, готов к написанию плана

## Цель

Во вкладке «тг бот» админского Telegram Mini App добавить отложенное выполнение:

1. **Рассылка** — отправить сообщение не сейчас, а в заданный момент (напр. пятница 14:00).
2. **Будущие турниры** — загрузить расписание на несколько месяцев вперёд так, чтобы показываемая
   версия менялась постепенно сама по мере наступления дат.

## Ключевые решения (согласованы с заказчиком)

- **Хостинг — бесплатный план Vercel (Hobby). Главное ограничение: не жечь лимиты функций.**
- Будущие турниры — **несколько текстовых версий по датам**, активная переключается по времени.
- Рассылка — **разовая** в конкретные дату/время (не повторяющаяся).
- Отложенная рассылка — **только текст** (без вложений → без Supabase Storage).
- Часовой пояс ввода — **Europe/Moscow** (фикс +03:00, без DST). Храним всё в UTC.
- Триггер для рассылки — **Supabase pg_cron + pg_net** (работает на любом плане Vercel, точность до минуты).
- Секрет и URL для pg_net — **плейсхолдеры в миграции**, подставляются вручную в SQL editor.
- Миграции применяются вручную в Supabase SQL editor (текущий workflow проекта).

## ANALYSIS — текущее состояние

- `app/tma/bot/page.tsx` — вкладка с секцией «Рассылка» (textarea + вложения + «Отправить») и секцией
  настроек, где «Расписание следующих турниров» — единственная textarea (`scheduleText`).
- `POST /api/tma/client-bot/broadcast` — грузит всех `client_bot_users`, шлёт **сейчас** через grammy.
  Поддерживает текст + файлы (photo/video/document).
- `scheduleText` хранится в `tournament_extras.data.clientBot.scheduleText`, читается **по запросу**
  в `app/api/client-bot/webhook/route.ts → handleScheduleMenuAction` (строка ~487), когда юзер тапает
  кнопку меню. Единственный потребитель `scheduleText`.
- Настройки сохраняются через `POST /api/tma/client-bot/settings` →
  `saveTournamentExtrasFromContext` (`lib/client-bot/server.ts`).
- TMA-роуты авторизуются через `requireTmaAuth` (`lib/tma/require-auth.ts`): валидирует initData,
  проверяет `tma_admins`, возвращает supabase-клиент на **service role**.
- Vercel serverless: нет долгоживущих процессов. Cron-инфраструктуры в проекте сейчас нет.

## Архитектура

Два независимых механизма, потому что природа разная:

### Фича 2 — Расписание с версиями по датам (без cron)

Читается лениво по запросу пользователя → отложку делаем выбором активной версии **в момент чтения**.
Cron не нужен. Нагрузка на лимиты — нулевая.

**Модель.** В `TournamentExtras.clientBot` добавляем поле:

```ts
scheduleVersions: { effectiveFrom: string /* ISO 8601 в UTC */; text: string }[]
```

`scheduleText` сохраняется как «базовое/текущее» расписание (показывается, пока ни одна версия не
активна). Обратная совместимость: старые данные → `scheduleVersions: []` → используется `scheduleText`.

**Выбор активной версии** (чистая функция, тестируемая отдельно):

- кандидаты = версии с `effectiveFrom <= now`;
- активная = с максимальным `effectiveFrom`;
- если активных нет → `scheduleText`.

Прошедшие версии перестают показываться сами, ничего не удаляем.

**Чтение** — в `handleScheduleMenuAction` (webhook клиент-бота) заменяем прямое чтение `scheduleText`
на вызов функции выбора активной версии.

**UI** — секция «Расписание»: базовый текст (`scheduleText`) + редактируемый список версий
(дата-время + текст, добавить/удалить). Сортировка по дате.

**Сохранение** — `POST /api/tma/client-bot/settings` принимает и валидирует `scheduleVersions`
(каждая: корректная дата + непустой текст), пишет в extras.

### Фича 1 — Отложенная рассылка (очередь + тик в Supabase)

Должна сработать проактивно → очередь в БД + тик. Тик в Supabase, чтобы не жечь Vercel.

**Таблица `scheduled_broadcasts`:**

| поле | тип | прим. |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `message` | text not null | только текст |
| `send_at` | timestamptz not null | UTC |
| `status` | text not null default 'pending' | pending / sent / failed / canceled |
| `created_at` | timestamptz not null default now() | |
| `sent_at` | timestamptz null | проставляется при отправке |
| `result` | jsonb null | `{ sent, failed, total }` |

RLS включён; доступ только для service role (как остальные TMA-данные). Индекс по
`(status, send_at)` для дешёвого поиска due-строк.

**Роуты:**

- `POST /api/tma/client-bot/broadcast` — расширяем: если в теле есть `sendAt` и он в будущем →
  вставляем строку в `scheduled_broadcasts` (status=pending), возвращаем `{ scheduled: true, id }`.
  Если `sendAt` отсутствует → текущее поведение (мгновенная отправка, с вложениями).
  `sendAt` в прошлом → 400.
- `GET /api/tma/client-bot/scheduled` — список pending + недавних (для UI). Сорт по `send_at`.
- `DELETE /api/tma/client-bot/scheduled/[id]` — отмена: pending → canceled. Не-pending → 409/404.
- `POST /api/cron/dispatch-broadcasts` — внутренний. Защита: заголовок `Authorization: Bearer <CRON_SECRET>`
  (env). Берёт `status='pending' AND send_at <= now()`, по каждой шлёт текст всем `client_bot_users`
  через grammy, проставляет `status`, `sent_at`, `result`. Идемпотентность: помечаем строку
  до/после отправки, чтобы повторный тик не дублировал (напр. перевод в 'sending' или выборка с
  `FOR UPDATE SKIP LOCKED` / атомарный update-возврат).

**Общий хелпер** `lib/client-bot/broadcast.ts`:

- `getClientBot()` — инстанс grammy (вынести из broadcast route);
- `sendTextToClientUsers(supabase, message) → { sent, failed, total }` — общий цикл для cron-роута;
- `pickActiveScheduleText(clientBot, now) → string` — выбор активной версии (фича 2).

Мгновенный роут оставляет свою обработку файлов; общим делаем только то, что переиспользуется.

**Тик (миграция, применяется вручную):**

- включить расширения `pg_cron`, `pg_net`;
- SQL-функция `dispatch_due_broadcasts()`:
  - `SELECT count(*) FROM scheduled_broadcasts WHERE status='pending' AND send_at <= now()`;
  - **только если > 0** → `net.http_post(url := '<APP_URL>/api/cron/dispatch-broadcasts',
    headers := jsonb '{"Authorization":"Bearer <CRON_SECRET>", "Content-Type":"application/json"}')`;
- `cron.schedule('dispatch-broadcasts', '*/5 * * * *', $$ SELECT dispatch_due_broadcasts() $$)`.

`<APP_URL>` и `<CRON_SECRET>` — плейсхолдеры, заполняются вручную перед запуском в SQL editor.

> **Минимизация лимитов Vercel:** пока в очереди нет due-строк, функция НЕ вызывает pg_net →
> Vercel не дёргается вообще. Когда есть due — ~1 вызов раз в ≤5 мин до отправки. На idle = 0 вызовов.

Точность: ±5 мин (для «пятница 14:00» достаточно).

**TZ:** в UI поле даты-времени трактуется как Europe/Moscow; на отправке конвертируем в UTC ISO
(применяя фикс +03:00). В БД и сравнении — UTC.

**Env:** добавить `CRON_SECRET` в `lib/env.ts` (server schema) и `.env.example`.

## Затрагиваемые файлы

| Файл | Изменение | Фича |
|---|---|---|
| `supabase/migrations/<new>.sql` | таблица + RLS + индекс + pg_cron/pg_net функция + schedule | 1 |
| `lib/timer/types.ts` | `scheduleVersions` в `TournamentExtras.clientBot` | 2 |
| `lib/tournament-extras-shared.ts` | дефолт + merge для `scheduleVersions` | 2 |
| `lib/client-bot/broadcast.ts` (новый) | `getClientBot`, `sendTextToClientUsers`, `pickActiveScheduleText` | 1+2 |
| `app/api/client-bot/webhook/route.ts` | выбор активной версии в `handleScheduleMenuAction` | 2 |
| `app/api/tma/client-bot/broadcast/route.ts` | ветка `sendAt` → очередь; reuse хелпера | 1 |
| `app/api/tma/client-bot/scheduled/route.ts` (новый) | GET список | 1 |
| `app/api/tma/client-bot/scheduled/[id]/route.ts` (новый) | DELETE отмена | 1 |
| `app/api/cron/dispatch-broadcasts/route.ts` (новый) | отправка по тику, защита `CRON_SECRET` | 1 |
| `app/api/tma/client-bot/settings/route.ts` | сохранение `scheduleVersions` | 2 |
| `app/tma/bot/page.tsx` | UI: datetime-picker + список pending; редактор версий расписания | 1+2 |
| `lib/env.ts`, `.env.example` | `CRON_SECRET` | 1 |

## RISKS

- **Дубли рассылки** при наложении тиков / ретрае pg_net → нужен атомарный захват строки
  (update status в 'sending' с возвратом, либо `FOR UPDATE SKIP LOCKED`). Проверить, что повторный
  тик не отправит дважды.
- **maxDuration 30с** у роута: рассылка по многим юзерам может не успеть. Текущий broadcast уже
  так работает — наследуем риск. При большой базе разбить на батчи (вне скоупа v1, отметить).
- **TZ-ошибки**: неверная конвертация Moscow→UTC даст отправку не в то время. Покрыть unit-тестом.
- **Незаполненные плейсхолдеры** в миграции (URL/секрет) → cron молча не дёрнет Vercel.
  Документировать шаг явно.
- **Обратная совместимость extras**: старые записи без `scheduleVersions` должны читаться (merge
  с дефолтом `[]`).
- **Защита cron-роута**: без верной `CRON_SECRET` — 401, чтобы никто извне не инициировал рассылку.

## TEST PLAN

- **Unit:** `pickActiveScheduleText` (нет версий / все будущие / выбор последней прошедшей /
  граница `effectiveFrom == now`); конвертация Moscow→UTC для `sendAt`.
- **Unit:** валидация входа settings (`scheduleVersions`: битая дата, пустой текст).
- **Integration (по возможности):** POST broadcast с `sendAt` в будущем создаёт pending-строку;
  без `sendAt` — шлёт сразу; `sendAt` в прошлом → 400. DELETE отменяет pending. Cron-роут
  отбирает due, не трогает будущие, проставляет статус, идемпотентен при повторе.
- Тесты запускать через vitest (`pnpm test`).

## Вне скоупа v1

- Повторяющиеся рассылки (cron-подобные).
- Вложения в отложенной рассылке (нужен Storage).
- Батчинг отправки при очень большой базе пользователей.
