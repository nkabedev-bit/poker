-- Seasons.
--
-- A rating period used to be guessed: months where games happened, plus whatever the
-- imported sheets were called. That guessing is the source of every period bug we hit —
-- seasons that lasted two months arrived as a month, month names came from sheet
-- titles, and the same games appeared under several periods at once.
--
-- A season is now declared by an admin: it has a name, a start, an optional end and its
-- own scoring rule. Games are stamped with the season that was open when they finished,
-- so nothing depends on reading dates back out of a title.

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_on date not null,
  ends_on date,
  -- How many of a player's best games count. NULL means every game counts.
  counted_games integer check (counted_games is null or counted_games > 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seasons_starts_on_idx on public.seasons (starts_on desc);

-- Only one season collects games at a time.
create unique index if not exists seasons_single_open_idx
  on public.seasons ((status = 'open')) where status = 'open';

create trigger seasons_touch_updated_at
before update on public.seasons
for each row execute function public.touch_updated_at();

-- The frozen table of a closed season: what the club announced, kept as it was
-- announced. Editing an old game no longer moves it; recomputing is deliberate.
create table if not exists public.season_standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  place integer not null check (place > 0),
  player_name text not null,
  telegram_id bigint,
  points numeric not null default 0,
  knockouts numeric not null default 0,
  games integer not null default 0,
  unique (season_id, player_name)
);

create index if not exists season_standings_season_idx
  on public.season_standings (season_id, place);

alter table public.tournament_results
  add column if not exists season_id uuid references public.seasons(id) on delete set null;

create index if not exists tournament_results_season_idx
  on public.tournament_results (season_id);

alter table public.seasons enable row level security;
alter table public.season_standings enable row level security;

create policy "authenticated seasons read"
on public.seasons for select to authenticated using (true);

create policy "authenticated seasons write"
on public.seasons for all to authenticated using (true) with check (true);

create policy "authenticated season standings read"
on public.season_standings for select to authenticated using (true);

create policy "authenticated season standings write"
on public.season_standings for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.seasons to authenticated, service_role;
grant select, insert, update, delete on table public.season_standings
  to authenticated, service_role;

-- Carry the imported periods over as closed seasons, keeping their announced totals.
insert into public.seasons (title, starts_on, ends_on, status, closed_at)
select
  coalesce(nullif(archive.label, ''), archive.month) as title,
  to_date(coalesce(archive.covered_first, archive.month) || '-01', 'YYYY-MM-DD') as starts_on,
  (to_date(coalesce(archive.covered_last, archive.month) || '-01', 'YYYY-MM-DD')
    + interval '1 month - 1 day')::date as ends_on,
  'closed',
  now()
from (
  select
    month,
    max(label) as label,
    min(coalesce(covered_months[1], month)) as covered_first,
    max(coalesce(covered_months[array_length(covered_months, 1)], month)) as covered_last
  from public.monthly_rating_archive
  group by month
) as archive
where not exists (
  select 1 from public.seasons
  where title = coalesce(nullif(archive.label, ''), archive.month)
);

insert into public.season_standings (season_id, place, player_name, points, knockouts, games)
select
  seasons.id,
  row_number() over (partition by archive.month order by archive.points desc) as place,
  archive.player_name,
  archive.points,
  archive.knockouts,
  0
from public.monthly_rating_archive as archive
join public.seasons
  on seasons.title = coalesce(nullif(archive.label, ''), archive.month)
on conflict (season_id, player_name) do nothing;
