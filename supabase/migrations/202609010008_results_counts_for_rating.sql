-- Not every evening is a rating game. Fun tournaments are played and recorded like any
-- other — the players still want to see them in their history — but they must not move
-- the monthly standings, so each result carries whether it counts.
alter table public.tournament_results
  add column if not exists counts_for_rating boolean not null default true;

create index if not exists tournament_results_counts_idx
  on public.tournament_results (counts_for_rating, played_on desc);
