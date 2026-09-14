-- Parallel seasons.
--
-- From 15 September to 6 October the club plays its qualifiers for the APC club cup.
-- Every rating game of those weeks counts twice: in the regular season, as always, and
-- in a table of its own for the qualifier. The two are never added together and neither
-- replaces the other.
--
-- Only one season could be open, and opening one closed the other. A parallel season is
-- open beside the regular one: opening it closes nothing, and opening the next regular
-- season leaves it running.
--
-- It is not stamped on games. It holds every rating game played inside its own dates, so
-- its table is right whenever the admin gets round to opening it, and the way the regular
-- season collects its games does not change.
--
-- Rollback: close the parallel season first, then
--   drop index if exists public.seasons_single_open_idx;
--   create unique index seasons_single_open_idx
--     on public.seasons ((status = 'open')) where status = 'open';
--   alter table public.seasons drop column if exists parallel;

alter table public.seasons
  add column if not exists parallel boolean not null default false;

-- One regular season collects games at a time; parallel ones run beside it.
drop index if exists public.seasons_single_open_idx;

create unique index if not exists seasons_single_open_idx
  on public.seasons ((status = 'open'))
  where status = 'open' and not parallel;
