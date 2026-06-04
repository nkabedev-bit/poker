# Telegram Mini App — Poker Admin Panel

> Мобильный инструмент управления турниром прямо из Telegram.

---

## Зафиксированные решения

| Вопрос | Решение |
|---|---|
| Баунти при разделении | **0.5 очка** каждому убившему |
| Google Sheets | Один документ, **новый лист на каждый день** (формат `04/05`) |
| Хостинг бота | **Vercel webhook** — проще, нет отдельного сервера |
| Добавление админов | Команда `/addadmin` в самом боте |
| Турниры | Один активный турнир (`limit(1)`) — без изменений |

---

## Архитектура

```
Telegram Bot (webhook → /api/bot/webhook)
    │
    └── Mini App (Next.js /tma/*)
            ├── Supabase — игроки, таймер, блайнды, bounty_log
            └── Google Sheets — лог выбываний (1 doc, лист = дата)
```

**Стек:**
- Бот: `grammy` (Node.js) — легковесная библиотека, webhook-friendly
- Mini App: Next.js страницы `/tma/*` в том же проекте
- Auth: HMAC-SHA256 валидация `initData` от Telegram
- БД: существующий Supabase + 2 новые таблицы
- Sheets: Google Sheets API v4 через Service Account

---

## Бот — команды

| Команда | Кто может | Что делает |
|---|---|---|
| `/start` | все | Приветствие + кнопка «Открыть панель» (Mini App) |
| `/addadmin @username` | только суперадмин | Добавить telegram_id в `tma_admins` |
| `/removeadmin @username` | только суперадмин | Удалить из `tma_admins` |
| `/admins` | только суперадмин | Список текущих администраторов |

**Суперадмин** — один telegram_id задаётся через env переменную `TMA_SUPER_ADMIN_ID`.

### Webhook endpoint

```
POST /api/bot/webhook
X-Telegram-Bot-Api-Secret-Token: <секрет из BotFather>
Body: Telegram Update JSON
```

Регистрация webhook при деплое:
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://poker-two-liart.vercel.app/api/bot/webhook
```

---

## Аутентификация Mini App

Каждый запрос к `/api/tma/*` требует заголовок `X-Telegram-Init-Data`.

```typescript
// lib/tma/auth.ts
import crypto from 'crypto';

export function validateInitData(initData: string): { ok: boolean; userId?: number } {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.TELEGRAM_BOT_TOKEN!)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  if (hash !== expectedHash) return { ok: false };

  // Проверка что initData не старше 1 часа
  const authDate = Number(params.get('auth_date'));
  if (Date.now() / 1000 - authDate > 3600) return { ok: false };

  const user = JSON.parse(params.get('user') ?? '{}') as { id?: number };
  return { ok: true, userId: user.id };
}
```

---

## Новые таблицы БД

### `tma_admins`

```sql
create table public.tma_admins (
  telegram_id bigint primary key,
  name        text not null,
  added_by    bigint,   -- telegram_id суперадмина
  added_at    timestamptz not null default now()
);
```

### `bounty_log`

```sql
create table public.bounty_log (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments(id) on delete cascade,
  eliminated_id    uuid not null,        -- id из extras.players
  eliminated_name  text not null,
  finish_place     integer,
  bounty_split     boolean not null default false,
  killers          jsonb not null default '[]',
  -- [{ "id": "uuid", "name": "Иван", "share": 0.5 }]
  cancelled        boolean not null default false,
  cancelled_at     timestamptz,
  recorded_by      bigint,               -- telegram_id администратора
  recorded_at      timestamptz not null default now()
);
```

---

## Google Sheets

### Структура

**Один документ**. При первом выбывании каждого дня — автоматически создаётся новый лист с именем `04/05` (день/месяц).

**Колонки листа:**

| A Время | B Место | C Выбывший | D Баунти (кто) | E Доля | F Раунд | G Отменено |
|---|---|---|---|---|---|---|
| 19:32 | 8 | Дмитрий Козлов | Иван Петров | 1.0 | 5 | |
| 19:45 | 7 | Алексей Громов | Иван / Мария | 0.5 / 0.5 | 6 | |
| 20:01 | 6 | Борис Соколов | — | — | 7 | ОТМЕНЕНО |

### Логика баунти

- **Один убийца** → доля `1.0`
- **Два убийцы** → доля `0.5` каждому
- **Три убийцы** → доля `0.33` каждому
- **Никто** → колонки D и E пустые

### Код

```typescript
// lib/google-sheets.ts
import { google } from 'googleapis';

function getTodaySheetName() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

async function getOrCreateSheet(sheets: any, spreadsheetId: string, sheetName: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(
    (s: any) => s.properties?.title === sheetName
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: { properties: { title: sheetName } }
        }],
      },
    });
    // Добавить заголовки
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Время', 'Место', 'Выбывший', 'Баунти (кто)', 'Доля', 'Раунд', 'Отменено']],
      },
    });
  }
}

export async function appendEliminationRow(data: {
  eliminatedName: string;
  finishPlace: number | null;
  killers: { name: string; share: number }[];
  currentRound: number;
}) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetName = getTodaySheetName();

  await getOrCreateSheet(sheets, process.env.GOOGLE_SHEET_ID!, sheetName);

  const killerNames = data.killers.map(k => k.name).join(' / ') || '—';
  const killerShares = data.killers.map(k => k.share.toFixed(2)).join(' / ') || '—';

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${sheetName}'!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        data.finishPlace ?? '',
        data.eliminatedName,
        killerNames,
        killerShares,
        data.currentRound,
        '',
      ]],
    },
  });
}

export async function markRowCancelled(spreadsheetId: string, sheetName: string, rowIndex: number) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!G${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['ОТМЕНЕНО']] },
  });
}
```

---

## API эндпоинты

| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/api/bot/webhook` | Telegram Bot webhook |
| GET | `/api/tma/players` | Список игроков |
| POST | `/api/tma/players` | Добавить игрока |
| DELETE | `/api/tma/players/[id]` | Удалить игрока |
| GET | `/api/tma/timer` | Состояние таймера + блайнды |
| POST | `/api/tma/timer/start` | Старт/возобновить |
| POST | `/api/tma/timer/pause` | Пауза |
| POST | `/api/tma/timer/next` | Следующий уровень |
| PATCH | `/api/tma/blinds` | Обновить длительность уровней |
| POST | `/api/tma/eliminations` | Зафиксировать выбывание |
| POST | `/api/tma/eliminations/[id]/cancel` | Отменить последнее выбывание |

---

## Переменные окружения

```bash
# Уже есть
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Новые
TELEGRAM_BOT_TOKEN=7123456789:AAF...
TELEGRAM_WEBHOOK_SECRET=случайная_строка_для_верификации
TMA_SUPER_ADMIN_ID=123456789   # твой telegram_id

GOOGLE_SHEET_ID=1BxiMVs0XRA5uJxmVHkjwmA4...
GOOGLE_SERVICE_ACCOUNT_EMAIL=poker@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

---

## Структура новых файлов

```
poker/
├── app/
│   ├── tma/
│   │   ├── layout.tsx          # Telegram SDK init, tab bar, auth check
│   │   ├── page.tsx            # redirect → /tma/players
│   │   ├── players/page.tsx    # Вкладка игроков
│   │   ├── control/page.tsx    # Вкладка управления
│   │   └── eliminations/
│   │       └── page.tsx        # Вкладка выбываний (4-шаговый флоу)
│   └── api/
│       ├── bot/webhook/route.ts
│       └── tma/
│           ├── players/route.ts
│           ├── timer/route.ts
│           ├── timer/start/route.ts
│           ├── timer/pause/route.ts
│           ├── timer/next/route.ts
│           ├── blinds/route.ts
│           └── eliminations/
│               ├── route.ts
│               └── [id]/cancel/route.ts
├── lib/
│   ├── google-sheets.ts
│   └── tma/
│       ├── auth.ts             # validateInitData()
│       └── require-auth.ts     # хелпер для route handlers
└── supabase/migrations/
    └── 20250504_tma.sql
```

---

## UI — вкладка Выбывания (флоу)

```
ШАГ 0: Список активных
┌────────────────────────────┐
│ ☠️ Выбывания                │
│ Нажмите на игрока           │
│ 🟢 Иван Петров   Ст.1/М.3  │
│ 🟢 Мария Сидорова Ст.2/М.7 │
│ [↩️ Отменить последнее]     │
└────────────────────────────┘
        ↓ тап
ШАГ 1: Кто выбил Ивана?
┌────────────────────────────┐
│ 🔍 Поиск...                │
│ ○ Мария Сидорова           │
│ ○ Дмитрий Козлов           │
│ [👥 Поделить баунти]       │
│ [🚫 Никто]                 │
└────────────────────────────┘
        ↓ выбор или мультивыбор
ШАГ 2: Подтверждение
┌────────────────────────────┐
│ ✅ Всё верно?              │
│ Выбывает: Иван Петров      │
│ Место: #8                  │
│ Баунти: Мария (0.5)        │
│         Дмитрий (0.5)      │
│ [✅ Подтвердить]           │
│ [❌ Отмена]                │
└────────────────────────────┘
```

---

## План разработки

### Фаза 1 — Фундамент (дни 1–2)
- [ ] Создать бота через @BotFather, настроить webhook
- [ ] `POST /api/bot/webhook` — обработка `/start`, `/addadmin`
- [ ] `lib/tma/auth.ts` — validateInitData
- [ ] SQL миграция `tma_admins` + `bounty_log`
- [ ] Скелет `/tma/` с tab navigation
- [ ] Настроить Google Service Account, проверить создание листа

### Фаза 2 — Вкладка «Игроки» (день 3)
- [ ] API players: GET, POST, DELETE
- [ ] UI: список с поиском, форма добавления
- [ ] MainButton Telegram SDK для submit

### Фаза 3 — Вкладка «Управление» (день 4)
- [ ] API timer: GET, start, pause, next
- [ ] API blinds: PATCH длительностей
- [ ] UI: живой таймер (polling 2с), кнопки, редактор блайндов

### Фаза 4 — Вкладка «Выбывания» (дни 5–6)
- [ ] UI 3-шаговый флоу (список → кто выбил → подтверждение)
- [ ] Мультивыбор для «поделить баунти» (доля = 1 / N)
- [ ] `POST /api/tma/eliminations` → Supabase + Sheets атомарно
- [ ] `POST /api/tma/eliminations/:id/cancel` + кнопка «Отменить»
- [ ] Обновление статуса игрока (`status: "eliminated"`)

### Фаза 5 — Полировка (день 7)
- [ ] HapticFeedback на ключевые действия
- [ ] CSS: адаптация под `--tg-theme-bg-color` / `--tg-theme-text-color`
- [ ] Обработка ошибок сети (toast + retry)
- [ ] Регистрация webhook на prod URL через Vercel env
