-- Отложенные рассылки клиентского бота.
-- Применять вручную в Supabase SQL editor. Заполнить <APP_URL> и <CRON_SECRET> перед запуском.

create table if not exists public.scheduled_broadcasts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  send_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'canceled')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  result jsonb
);

create index if not exists scheduled_broadcasts_due_idx
  on public.scheduled_broadcasts (status, send_at);

alter table public.scheduled_broadcasts enable row level security;
-- Без policies: anon/authenticated доступа нет. service_role обходит RLS (используется в API-роутах).

-- Тик: pg_cron каждые 5 минут вызывает функцию, которая дёргает Vercel ТОЛЬКО при наличии due-строк.
-- Пока очереди нет — внешний HTTP-вызов не выполняется (экономия лимитов Vercel Hobby).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_due_broadcasts()
returns void
language plpgsql
security definer
as $$
declare
  due_count int;
begin
  select count(*) into due_count
    from public.scheduled_broadcasts
   where status = 'pending' and send_at <= now();

  if due_count > 0 then
    perform net.http_post(
      url := '<APP_URL>/api/cron/dispatch-broadcasts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET>',
        'Content-Type', 'application/json'
      )
    );
  end if;
end;
$$;

select cron.schedule(
  'dispatch-broadcasts',
  '*/5 * * * *',
  $$ select public.dispatch_due_broadcasts(); $$
);
