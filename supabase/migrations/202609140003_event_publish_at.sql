-- Публикация афиши по времени.
--
-- Черновику можно назначить время публикации: не позже чем через 5 минут после него афиша
-- появляется у игроков, а тем, кому отложен билет, уходит сообщение — как по кнопке
-- «Показать».
--
-- Новой задачи cron нет: проверку делает уже работающая задача рассылок раз в 5 минут.
-- Vercel вызывается, только когда есть черновик, которому пора выйти, — один вызов на
-- афишу. Подстраховка в приложении: список афиш сам публикует созревшие, если его откроют
-- раньше.
--
-- Плюс ежедневная чистка журнала запусков cron: pg_cron не чистит cron.job_run_details
-- сам, а каждая задача пишет туда строку на каждый запуск.
--
-- Применять вручную в Supabase SQL editor. Перед запуском заменить <APP_URL> и
-- <CRON_SECRET> — те же значения, что в 202606180001_scheduled_broadcasts.sql.
-- <APP_URL> — только домен (https://poker-two-liart.vercel.app), БЕЗ пути страницы.
-- Повторный запуск безопасен.

alter table public.tournament_events
  add column if not exists publish_at timestamptz;

-- Черновики с назначенным временем — только их и ищет задача раз в 5 минут.
create index if not exists tournament_events_publish_due_idx
  on public.tournament_events (publish_at)
  where is_published = false and publish_at is not null;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_due_event_publications()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.tournament_events
    where is_published = false
      and publish_at is not null
      and publish_at <= now()
  ) then
    perform net.http_post(
      url := '<APP_URL>/api/cron/publish-events',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET>',
        'Content-Type', 'application/json'
      )
    );
  end if;
end;
$$;

-- Одна задача раз в 5 минут делает обе проверки: отложенные рассылки и афиши.
create or replace function public.dispatch_due_club_work()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.dispatch_due_broadcasts();
  perform public.dispatch_due_event_publications();
end;
$$;

-- Обе функции зовёт только pg_cron от имени владельца. Через API их вызывать никому не нужно:
-- иначе любой с публичным ключом Supabase мог бы дёргать Vercel, пока черновик ждёт публикации.
revoke all on function public.dispatch_due_event_publications() from public, anon;
revoke all on function public.dispatch_due_club_work() from public, anon;

select cron.unschedule(jobid) from cron.job where jobname = 'dispatch-broadcasts';

select cron.schedule(
  'dispatch-broadcasts',
  '*/5 * * * *',
  $$ select public.dispatch_due_club_work(); $$
);

-- Журнал запусков хранится неделю. Чистка раз в сутки, в 06:30 МСК.
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-cron-run-details';

select cron.schedule(
  'cleanup-cron-run-details',
  '30 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$
);
