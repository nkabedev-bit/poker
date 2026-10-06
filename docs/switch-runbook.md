# Переключение на свой сервер — сценарий дня переключения

Сервер: `deploy@168.222.194.107` (Reg.ru, Самара), приложение `/opt/club`, Supabase `/opt/supabase`.
Скрипты: `deploy/migrate/` (копируются на сервер в `~/migrate`). День — без игры.
Все команды на сервере, если не сказано иное.

## Накануне

- [ ] В `/opt/club/.env` заполнено всё, кроме `GOOGLE_SHEET_ID` / `GOOGLE_FINANCE_SHEET_ID`
      (на репетиции стоят копии таблиц): токены ботов, Google-ключ, Яндекс, ADMIN_EMAIL, TMA_SUPER_ADMIN_ID.
      Пустую необязательную переменную не оставлять `KEY=` — закомментировать: zod в `lib/env.ts`
      считает пустую строку ошибкой, и падают крон, вход через Яндекс и авторизация мини-аппа.
- [x] Репетиция 07.10 ~01:00: `dump.sh` → `restore.sh` → `compare.sh` → `copy_storage.py` — 20 таблиц
      клуба совпали, 367 файлов, всё с нуля за ~2 мин (дамп 27 с, восстановление 2 с, файлы 68 с).
- [ ] Ветка `dev-hosting-switch` (переадресация Vercel) готова, не запушена.

## 1. Начало (T+0)

1. Предупредить админов: админку не трогать, приложение ~1–2 ч может не открываться.
2. Снять список задач pg_cron в облаке и выключить их, чтобы старая система не рассылала параллельно:

   ```bash
   docker exec -i supabase-db psql "$(cat ~/secrets/source-db-url)" -At \
     -c "select jobname, schedule, command from cron.job" > ~/migration/cloud-cron-before-switch.tsv
   docker exec -i supabase-db psql "$(cat ~/secrets/source-db-url)" -At \
     -c "select cron.unschedule(jobid) from cron.job"
   ```

## 2. Чистая база здесь

`/opt/supabase/.env` читает только root, поэтому compose — через sudo. «Network … Resource is
still in use» при down — нормально (к сети подключены club-app и Caddy). Около 20 с.

```bash
cd /opt/supabase && sudo docker compose down
sudo rm -rf volumes/db/data && sudo find volumes/storage -mindepth 1 -delete
sudo docker compose up -d && docker ps --filter name=supabase --format "{{.Names}} {{.Status}}"
```

## 3. Перенос

```bash
cd ~/migrate
DUMP=$(bash dump.sh)              # ~30 с
bash restore.sh "$DUMP"           # ~2 с; в функции крона — CRON_SECRET сервера, без опечатки «vercel.app)»
bash compare.sh                   # public.* без «differs»; служебные auth/storage различаются — норма
python3 copy_storage.py           # ~70 с, файлы через /media на Vercel — до переадресации!
```

## 4. Настоящие таблицы, задачи, перезапуск

1. В `/opt/club/.env` — настоящие `GOOGLE_SHEET_ID` и `GOOGLE_FINANCE_SHEET_ID` из `~/secrets/real-sheet-ids`
   (до переключения основная пустая, финансовая — копия «Копия Покер финансы»).
2. `cd /opt/club && docker compose up -d --force-recreate app`
3. `bash ~/migrate/cron.sh` — четыре задачи, сверить с `cloud-cron-before-switch.tsv`.

## 5. Вебхуки ботов → пересыльщик на Vercel

Telegram не достаёт до серверов в РФ, поэтому вебхуки — на Vercel, оттуда на pokerptz.ru.
Вызов идёт через релей (сервер сам до api.telegram.org не достаёт):

```bash
cd /opt/club && set -a && . ./.env && set +a
R="--resolve poker-two-liart.vercel.app:443:76.76.21.21 https://poker-two-liart.vercel.app/api/tg-relay"
curl -s $R/bot$TELEGRAM_BOT_TOKEN/setWebhook \
  -d url=https://poker-two-liart.vercel.app/api/tg-hook/admin -d secret_token=$TELEGRAM_WEBHOOK_SECRET
curl -s $R/bot$CLIENT_TELEGRAM_BOT_TOKEN/setWebhook \
  -d url=https://poker-two-liart.vercel.app/api/tg-hook/client -d secret_token=$CLIENT_TELEGRAM_WEBHOOK_SECRET
curl -s $R/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo; curl -s $R/bot$CLIENT_TELEGRAM_BOT_TOKEN/getWebhookInfo
```

`pending_update_count` должен уйти в 0, `last_error_message` — пусто.

## 6. BotFather (владелец)

У каждого бота: **Bot Settings → Menu Button** и **Configure Mini App** → новый адрес:
- бот для игроков: `https://pokerptz.ru/client`
- бот для админов: `https://pokerptz.ru/tma/players`

Потом в админ-боте `/setupmenu`.

## 7. Старый сайт → переадресация, автодеплой

1. Запушить `dev-hosting-switch` в main: Vercel отвечает 307 на pokerptz.ru везде, кроме
   `/api/tg-relay/` и `/api/tg-hook/`.
2. `gh variable set DEPLOY_ENABLED --body true` и `gh workflow run Deploy` — свежий образ из main.

## 8. Проверка (телефон без VPN)

- [ ] Мини-апп игрока: профиль, аватарки, рейтинг, афиши, запись
- [ ] `/start` в боте игроков отвечает
- [ ] Админка: игроки, создать и удалить тестовый турнир
- [ ] Вход на сайт через Яндекс
- [ ] Экран в зале: `https://pokerptz.ru/screen/<тот же токен>` — открыть на ноутбуке, в закладки
- [ ] Рассылка себе (админ-бот) — уходит через релей

## Откат (если что-то не так до четверга)

1. Вебхуки обратно на Vercel. Прежние секреты знает только Vercel (Sensitive), поэтому:
   в Vercel → Settings → Environment Variables задать `TELEGRAM_WEBHOOK_SECRET` и
   `CLIENT_TELEGRAM_WEBHOOK_SECRET` = значения из `/opt/club/.env`, Redeploy, затем
   `setWebhook url=https://poker-two-liart.vercel.app/api/bot/webhook` (и `/api/client-bot/webhook`)
   с этими секретами.
2. BotFather — старые адреса, `git revert` коммита переадресации и пуш.
3. Задачи pg_cron в облаке — по `cloud-cron-before-switch.tsv`.
4. Данные, записанные на новом сервере после переключения, — перенести руками (в выходной их мало).
