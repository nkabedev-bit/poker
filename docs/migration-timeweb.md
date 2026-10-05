# Переезд с Vercel + Supabase Cloud на Timeweb

План утверждён 04.10.2026. Прод не трогаем до этапа 5.

## Схема

```
Телефоны, экран в зале (РФ)
        │ https
        ▼
Timeweb СПб (Cloud-80: 4 vCPU / 8 ГБ / 80 ГБ)
 ├─ Caddy (HTTPS)
 │   ├─ <домен>      → Next.js: сайт, мини-апп, админка TMA, вебхуки ботов, /api/cron/*
 │   └─ api.<домен>  → Supabase (Kong): REST, Auth, Storage, Realtime, Studio под паролем
 ├─ Supabase self-hosted (Docker) + pg_cron
 └─ ночной бэкап → релей
        │ исходящие в Telegram (и Google, если заблокирован)
        ▼
Релей за рубежом (Timeweb, минимальный тариф)
 ├─ tg.<домен> → api.telegram.org, только с IP РФ-сервера
 ├─ хранит бэкапы 14 дней
 └─ пинг сайта раз в минуту, при падении пишет админу
```

## Этап 0. Подготовка (владелец)

- [ ] Домен: купить или выбрать имеющийся
- [ ] DNS: `A <домен>`, `A api.<домен>` → IP РФ-сервера
- [ ] Ключ `~/.ssh/club_timeweb_ed25519.pub` на РФ-сервере
- [ ] Платный релей не заказывать, пока бесплатные варианты не проверены
- [ ] Версия Postgres в Supabase (Project Settings → Infrastructure)

## Этап 1. Проверка сети (гейт)

Выход в Telegram — по порядку, первый рабочий:
0. api.telegram.org напрямую с РФ-сервера — вдруг с Timeweb СПб работает
1. Vercel как релей. Шаг А без кода: сутки качать `/telegram-web-app.js` (117 КБ) раз в 5 мин, по всем IP Vercel.
   Шаг Б при успехе: роут `/api/tg-relay/...` в приложении (пускает только токены наших ботов), пуш с ОК владельца,
   с сервера getMe / sendMessage владельцу / sendPhoto 1 МБ / скачивание файла, сутки раз в 5 мин
2. Свой Bot API сервер (`tdlib/telegram-bot-api`, MTProto) — шансы низкие: Telegram в РФ работает только под VPN
3. Платный минимальный VPS Timeweb за рубежом
(VPN владельца не годится: подписка без доступа к серверу)

Входящие вебхуки: Telegram не может подключиться к серверу в РФ (проверено 05.10 тестовым ботом: «Connection timed out», при этом 12 точек мира до порта достают). Адреса Telegram отрезаны от РФ-серверов в обе стороны → вебхуки принимает Vercel (`/api/tg-hook/[bot]`) и пересылает на сервер.

Бэкапы без релея — Яндекс Диск (rclone), монитор — UptimeRobot.


С РФ-сервера: api.telegram.org напрямую и через релей, sheets/oauth2.googleapis.com,
oauth.yandex.ru, Docker Hub / зеркало Timeweb, github.com / ghcr.io, пулер Supabase.
Вебхук Telegram → РФ-сервер. Телефон без VPN (мобильный + Wi-Fi зала): страница 500 КБ.

## Этап 2. Серверы

Сервер: Reg.ru Самара, 168.222.194.107, 2 vCPU / 4 ГБ / 60 ГБ (московские IP Timeweb и Reg.ru оказались без внешней сети).

- [x] Пользователь deploy, вход только по ключу, ufw 22/80/443, fail2ban, unattended-upgrades, swap 4 ГБ — `deploy/server/bootstrap.sh`
- [x] Docker; порты контейнеров только на 127.0.0.1
- [x] Supabase self-hosted v0.8.2 в `/opt/supabase`: PG 17.6, новые секреты, без edge functions / imgproxy / supavisor — `deploy/supabase/docker-compose.override.yml`
- [ ] Caddy: `<домен>`, `api.<домен>`
- [ ] Релей: Caddy `tg.<домен>` → api.telegram.org с allowlist по IP
- [ ] Бэкап: pg_dump + storage каждую ночь → релей, 14 дней
- [ ] Монитор на релее

## Этап 3. Код (ветка + PR, совместимо с Vercel)

- [ ] `next.config.ts`: `output: "standalone"`; `Dockerfile`, `.dockerignore`
- [ ] `TELEGRAM_API_ROOT`: общий `createBot` вместо 5 `new Bot(...)` + `lib/client-bot/avatar.ts`
- [ ] Google: `HTTPS_PROXY` через релей — только если этап 1 покажет блокировку
- [ ] `deploy/`: compose приложения, Caddyfile, backup.sh, конфиг релея (без секретов)
- [ ] `.github/workflows/deploy.yml`: тесты → сборка образа в GitHub → `docker save | ssh` → перезапуск
- [ ] На сервере `VERCEL_PROJECT_PRODUCTION_URL=<домен>` (читается в 3 местах)

## Этап 4. Репетиция (тестовые боты)

- [ ] Дамп: roles / schema / data (`supabase db dump`), замена `nqflqsipvqxuubboslak.supabase.co` на `api.<домен>` в data.sql
- [ ] Восстановление (`psql --single-transaction`, `session_replication_role = replica`)
- [ ] Файлы бакетов: player-avatars, tournament-logos, tournament-sounds
- [ ] 4 cron-задачи на `http://app:3000/api/cron/*` с новым CRON_SECRET
- [ ] Чек-лист: турнир, вылет, ребай, розыгрыш, экран в зале, мини-апп, вход Яндекс, Sheets, рассылка, cron
- [ ] Замер времени переноса

## Этап 5. Переключение (день без игры)

1. Предупредить админов
2. Старый Supabase: `cron.unschedule` всех задач
3. `setWebhook` обоих ботов → `https://poker-two-liart.vercel.app/api/tg-hook/admin` и `/client` с секретами из `/opt/club/.env` (Telegram не достаёт до серверов в РФ — Vercel пересылает на pokerptz.ru)
4. Финальный дамп → восстановление → файлы → cron
5. Запуск, смоук
6. BotFather: URL мини-аппа и кнопка меню у обоих ботов; `/setupmenu`
7. Яндекс OAuth: новый redirect URI (старый оставить)
8. Проверка с телефона без VPN

## Этап 6. Обкатка (1–2 недели)

Vercel и Supabase Cloud не удаляем. Откат: вебхуки + BotFather обратно, обратный перенос данных.
После 2 недель без проблем — выключить автодеплой Vercel.

## Этап 7. Подъём лимитов (отдельные PR)

Realtime экрана, частота опросов мини-аппа, рейтинг, лимит загрузок, миниатюры на сервере.
