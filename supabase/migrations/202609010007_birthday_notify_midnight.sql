-- Уведомление о днях рождения переезжает с 12:00 на 00:00 по Москве: админ узнаёт про
-- день рождения сразу, как день наступил. 00:00 МСК = 21:00 UTC предыдущих суток —
-- эндпоинт считает «сегодня» по московской дате, поэтому в 21:00 UTC он уже видит
-- наступивший день.
-- Применять вручную в Supabase SQL editor. Заполнить <APP_URL> и <CRON_SECRET> перед запуском.

-- Снимаем старое расписание. Строк нет — значит задачи и не было, ошибки не будет.
select cron.unschedule(jobid) from cron.job where jobname = 'birthday-notify';

select cron.schedule(
  'birthday-notify',
  '0 21 * * *',
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
