-- Archived monthly standings.
--
-- The club kept its rating by hand, a sheet per month, and those months exist only as
-- totals: who scored how much, with no per-game breakdown to reconstruct. They are
-- stored as they are, and the app shows them for months it has no games of its own for.
-- Months played from now on are computed from tournament_results instead.

create table if not exists public.monthly_rating_archive (
  id uuid primary key default gen_random_uuid(),
  -- "2026-09"
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  player_name text not null,
  points numeric not null default 0,
  knockouts numeric not null default 0,
  source_sheet text not null default '',
  created_at timestamptz not null default now(),
  unique (month, player_name)
);

create index if not exists monthly_rating_archive_month_idx
  on public.monthly_rating_archive (month);

alter table public.monthly_rating_archive enable row level security;

create policy "authenticated archive read"
on public.monthly_rating_archive for select to authenticated using (true);

create policy "authenticated archive write"
on public.monthly_rating_archive for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.monthly_rating_archive
  to authenticated, service_role;
