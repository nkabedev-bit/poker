-- What a player spent on staying in the game, kept with the result.
--
-- Null is not zero here: an evening stored before this column existed, or imported from
-- the club's old tables, knows nothing about re-entries. A badge for a clean run must
-- not be handed out on a guess, so those rows count for nothing and only the games
-- played from now on can earn it. Zero is a real answer — the player bought nothing.

alter table public.tournament_results
  add column if not exists rebuys integer check (rebuys >= 0);
