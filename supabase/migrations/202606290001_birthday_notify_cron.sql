-- Ежедневное уведомление админу о днях рождения игроков из листа «анкеты».
-- Применять вручную в Supabase SQL editor. Заполнить <APP_URL> и <CRON_SECRET> перед запуском.

-- Очередь не нужна: эндпоинт сам читает лист и решает, кому слать. pg_cron просто дёргает
-- его раз в день. Время cron — в UTC: 12:00 МСК = 09:00 UTC.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'birthday-notify',
  '0 9 * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/birthday-notify',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
