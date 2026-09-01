-- Per-tournament results.
--
-- Until now a finished tournament left only two traces: cumulative counters on the
-- player (games, knockouts, top-9) and a sheet in the club's spreadsheet. The roster
-- itself is wiped on finish, so nobody could answer "what did I place last Friday" or
-- "who won in August" from the app.
--
-- One row per player per game turns that around: the monthly standings, a player's own
-- history and the full table of any past game are all queries over this, with no sheet
-- to rename and no API quota to run into.

create table if not exists public.tournament_results (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete set null,
  event_id uuid references public.tournament_events(id) on delete set null,
  -- The moment the game started, which is what separates two tournaments played on the
  -- same date; played_on is derived from it for month grouping.
  started_at timestamptz not null,
  played_on date not null,
  title text not null default '',
  telegram_id bigint,
  player_name text not null,
  place integer check (place > 0),
  points numeric not null default 0,
  knockouts numeric not null default 0,
  source text not null default 'app' check (source in ('app', 'import')),
  created_at timestamptz not null default now(),
  -- Re-running a finish must not double a player's evening.
  unique (started_at, player_name)
);

create index if not exists tournament_results_played_on_idx
  on public.tournament_results (played_on desc);

create index if not exists tournament_results_telegram_idx
  on public.tournament_results (telegram_id);

create index if not exists tournament_results_name_idx
  on public.tournament_results (lower(player_name));

alter table public.tournament_results enable row level security;

create policy "authenticated results read"
on public.tournament_results for select to authenticated using (true);

create policy "authenticated results write"
on public.tournament_results for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.tournament_results
  to authenticated, service_role;
