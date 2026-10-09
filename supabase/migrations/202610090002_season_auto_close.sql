-- Сезон закрывается сам на следующий день после даты окончания, в 12:00 МСК.
--
-- Раньше сезон с датой окончания висел «идёт», пока админ не нажмёт «Закрыть»:
-- отбор на кубок APC (15.09–07.10) так и остался открытым. Закрытие то же, что у кнопки:
-- таблица замораживается, сезон получает статус closed и сохраняет свою дату окончания.
-- Последний вечер заканчивается после полуночи, к полудню его итоги давно внесены.
--
-- Приложение зовём, только когда есть что закрывать: открытый сезон, чей последний день
-- (по Москве) уже прошёл. Сезон без даты окончания не закрывается сам никогда.
--
-- Перед применением замените <APP_URL> (на сервере http://club-app:3000) и <CRON_SECRET>
-- (CRON_SECRET из /opt/club/.env).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_due_season_closures()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
      from public.seasons
     where status = 'open'
       and ends_on is not null
       and ends_on < (now() at time zone 'Europe/Moscow')::date
  ) then
    perform net.http_post(
      url := '<APP_URL>/api/cron/close-seasons',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET>',
        'Content-Type', 'application/json'
      ),
      -- Заморозка таблицы читает все игры сезона; пять секунд по умолчанию мало.
      timeout_milliseconds := 60000
    );
  end if;
end;
$$;

revoke all on function public.dispatch_due_season_closures() from public, anon, authenticated;

-- 09:00 UTC = 12:00 МСК.
select cron.schedule('close-seasons', '0 9 * * *', $$ select public.dispatch_due_season_closures(); $$);
