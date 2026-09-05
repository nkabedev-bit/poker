-- A club account stops requiring Telegram.
--
-- Some of the players do not use Telegram at all, and the club has had nowhere to put
-- them: the account row demands a Telegram id, and the sign-ups hang off that id. They
-- sign in through Yandex instead, which needs neither a domain of our own nor a VPN.
--
-- The account's own `id` becomes what a sign-up points at. `telegram_id` stays, filled
-- in for everyone who arrived through the bot and empty for everyone who did not, so
-- nothing that reads it today has to change.
--
-- This migration only adds. The old keys on event_signups are dropped by the migration
-- that ships with the code reading the new ones — taking them away now would break the
-- upserts running in production this minute.

-- The two doors into one account.
alter table public.client_bot_users
  alter column telegram_id drop not null,
  alter column chat_id drop not null;

alter table public.client_bot_users
  add column if not exists yandex_id text,
  add column if not exists email text,
  add column if not exists auth_provider text not null default 'telegram'
    check (auth_provider in ('telegram', 'yandex'));

-- Postgres counts nulls as distinct, so this holds only the accounts that have a Yandex
-- login — one account each, and no row for the players who never used it.
create unique index if not exists client_bot_users_yandex_id_key
  on public.client_bot_users (yandex_id)
  where yandex_id is not null;

-- An account nobody can sign in to is not an account.
alter table public.client_bot_users
  drop constraint if exists client_bot_users_has_a_door;

alter table public.client_bot_users
  add constraint client_bot_users_has_a_door
    check (telegram_id is not null or yandex_id is not null);

-- What a sign-up belongs to, once a player need not have a Telegram id to make one.
alter table public.event_signups
  add column if not exists user_id uuid references public.client_bot_users(id) on delete cascade;

update public.event_signups as signup
set user_id = account.id
from public.client_bot_users as account
where signup.user_id is null
  and account.telegram_id = signup.telegram_id;

-- Every existing sign-up carries a Telegram id that a foreign key already guaranteed an
-- account for, so the backfill above leaves none behind.
alter table public.event_signups
  alter column user_id set not null;

create unique index if not exists event_signups_event_user_once
  on public.event_signups (event_id, user_id);

-- The +1 of a pair, by account rather than by Telegram id.
alter table public.event_signups
  add column if not exists duo_partner_user_id uuid
    references public.client_bot_users(id) on delete set null;

alter table public.event_signups
  add column if not exists duo_host_user_id uuid
    references public.client_bot_users(id) on delete cascade;

update public.event_signups as signup
set duo_partner_user_id = account.id
from public.client_bot_users as account
where signup.duo_partner_user_id is null
  and signup.duo_partner_telegram_id is not null
  and account.telegram_id = signup.duo_partner_telegram_id;

update public.event_signups as signup
set duo_host_user_id = account.id
from public.client_bot_users as account
where signup.duo_host_user_id is null
  and signup.duo_host_telegram_id is not null
  and account.telegram_id = signup.duo_host_telegram_id;

-- A member is asked to be somebody's +1 once an evening, now counted by account. The
-- index over duo_partner_telegram_id stays until the code reads this one instead.
create unique index if not exists event_signups_duo_partner_user_once
  on public.event_signups (event_id, duo_partner_user_id)
  where duo_partner_user_id is not null and status <> 'cancelled';

create index if not exists event_signups_duo_host_user_idx
  on public.event_signups (event_id, duo_host_user_id);
