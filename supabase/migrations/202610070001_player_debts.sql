-- Долги игроков: журнал неоплаченных вечеров, журнал оплат и запрет записи.
--
-- «Касса» после финиша живёт час, и следующая игра её перезаписывает — долг за вечер
-- нигде не оставался. Теперь при финише каждому, кто не отмечен «Оплатил», пишется строка
-- в player_debts. Деньги, которые игрок приносит потом, пишутся отдельно в debt_payments:
-- игрок может закрыть несколько игр разом или принести часть суммы. Сколько осталось
-- должен игрок — это всё начисленное минус все оплаты; оплаты гасят игры от старых к новым.
--
-- Пока долг не закрыт, игрок не может записываться на игры (с 12:00 МСК следующего дня
-- после игры) и каждый день в 18:00 МСК получает напоминание в бот. Админ командой
-- /allowdebt разрешает запись на несколько дней: напоминания в эти дни не идут, а когда
-- срок выйдет, админу, выдавшему разрешение, приходит сообщение.
--
-- Применять вручную, подставив <APP_URL> и <CRON_SECRET>. Повторный запуск безопасен.

create table if not exists public.player_debts (
  id uuid primary key default gen_random_uuid(),
  -- Кто должен: id аккаунта, а у гостя без аккаунта — "name:" и ключ ника.
  debtor_key text not null,
  account_id uuid references public.client_bot_users(id) on delete set null,
  player_name text not null,
  -- Начало игры: то же время, что в tournament_results.started_at.
  game_started_at timestamptz not null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  amount integer not null check (amount > 0),
  -- С этого момента долг закрывает запись на игры.
  blocks_from timestamptz not null,
  -- Напоминать ли в бот. Долги, перенесённые из финансовой таблицы, — нет.
  remind boolean not null default true,
  source text not null default 'app' check (source in ('app', 'import')),
  created_at timestamptz not null default now(),
  unique (game_started_at, debtor_key)
);

create index if not exists player_debts_debtor_idx
  on public.player_debts (debtor_key, game_started_at);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debtor_key text not null,
  account_id uuid references public.client_bot_users(id) on delete set null,
  player_name text not null,
  amount integer not null check (amount > 0),
  -- payment — деньги принесли, writeoff — клуб простил остаток.
  kind text not null default 'payment' check (kind in ('payment', 'writeoff')),
  -- Telegram id админа, который принял деньги.
  recorded_by bigint,
  created_at timestamptz not null default now(),
  -- Отменённая по ошибке оплата остаётся в истории, но долг не гасит.
  cancelled_at timestamptz
);

create index if not exists debt_payments_debtor_idx
  on public.debt_payments (debtor_key, created_at);

alter table public.client_bot_users
  add column if not exists debt_allowed_until timestamptz,
  add column if not exists debt_allowed_by bigint;

comment on column public.client_bot_users.debt_allowed_until is
  'До этого момента игрок может записываться на игры, хотя долг не закрыт (/allowdebt). NULL — разрешения нет.';
comment on column public.client_bot_users.debt_allowed_by is
  'Админ, выдавший /allowdebt. Ему пишем, когда разрешение закончится; после сообщения — NULL.';

alter table public.player_debts enable row level security;
alter table public.debt_payments enable row level security;

-- Читает и пишет только сервер приложения.
revoke all on table public.player_debts from anon, authenticated;
revoke all on table public.debt_payments from anon, authenticated;
grant all on table public.player_debts to service_role;
grant all on table public.debt_payments to service_role;

-- Работа по расписанию. Приложение зовём только когда есть что делать:
-- remind — в 18:00 МСК, если есть долги с напоминанием, которые уже закрывают запись;
-- allowances — каждые 10 минут, если у кого-то закончилось разрешение /allowdebt.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_debt_work(task text)
returns void
language plpgsql
security definer
as $$
declare
  due boolean;
begin
  if task = 'remind' then
    select exists (
      select 1 from public.player_debts where remind and blocks_from <= now()
    ) into due;
  elsif task = 'allowances' then
    select exists (
      select 1 from public.client_bot_users
       where debt_allowed_by is not null and debt_allowed_until <= now()
    ) into due;
  else
    raise exception 'Unknown debt task: %', task;
  end if;

  if due then
    perform net.http_post(
      url := '<APP_URL>/api/cron/debts',
      body := jsonb_build_object('task', task),
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET>',
        'Content-Type', 'application/json'
      )
    );
  end if;
end;
$$;

revoke all on function public.dispatch_debt_work(text) from public, anon, authenticated;

-- 15:00 UTC = 18:00 МСК.
select cron.schedule('debt-reminders', '0 15 * * *', $$ select public.dispatch_debt_work('remind'); $$);
select cron.schedule('debt-allowances', '*/10 * * * *', $$ select public.dispatch_debt_work('allowances'); $$);
