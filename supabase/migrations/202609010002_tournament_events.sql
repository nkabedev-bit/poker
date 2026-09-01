-- Tournament announcements (afishas) and player sign-ups.
--
-- These are deliberately separate from `tournaments`: that row is the ONE live
-- tournament the timer, the roster and the Sheets sync revolve around. An event is
-- a future game shown in the client mini-app, and a sign-up is a request to play —
-- the registration number and the table are still handed out by an admin on game
-- day, so nothing here writes into the live roster.

create table if not exists public.tournament_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  badge text,
  starts_at timestamptz not null,
  late_entry_until timestamptz,
  max_players integer check (max_players > 0),
  buy_in integer not null default 0 check (buy_in >= 0),
  starting_stack integer check (starting_stack > 0),
  venue_address text not null default '',
  rules_text text not null default '',
  features_text text not null default '',
  poster_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournament_events_starts_at_idx
  on public.tournament_events (starts_at desc);

create table if not exists public.event_signups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.tournament_events(id) on delete cascade,
  telegram_id bigint not null references public.client_bot_users(telegram_id) on delete cascade,
  status text not null default 'signed_up'
    check (status in ('signed_up', 'cancelled', 'seated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, telegram_id)
);

create index if not exists event_signups_event_status_idx
  on public.event_signups (event_id, status);

create trigger tournament_events_touch_updated_at
before update on public.tournament_events
for each row execute function public.touch_updated_at();

create trigger event_signups_touch_updated_at
before update on public.event_signups
for each row execute function public.touch_updated_at();

alter table public.tournament_events enable row level security;
alter table public.event_signups enable row level security;

-- Published events are readable without a login: the public web storefront planned
-- for a later stage serves them to visitors who never open Telegram.
create policy "public published events read"
on public.tournament_events for select to anon, authenticated
using (is_published = true);

create policy "authenticated events read"
on public.tournament_events for select to authenticated using (true);

create policy "authenticated events write"
on public.tournament_events for all to authenticated using (true) with check (true);

create policy "authenticated signups read"
on public.event_signups for select to authenticated using (true);

create policy "authenticated signups write"
on public.event_signups for all to authenticated using (true) with check (true);

grant select on table public.tournament_events to anon;
grant select, insert, update, delete on table public.tournament_events to authenticated, service_role;
grant select, insert, update, delete on table public.event_signups to authenticated, service_role;
