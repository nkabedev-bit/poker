-- Zero VIP seats is a real answer.
--
-- Some tournaments run without the VIP table at all, and the admin says so by writing 0
-- in the poster. The original column only allowed positive numbers, so that 0 was
-- refused and the field stayed empty — which now means "the VIP table's own ten seats".

alter table public.tournament_events
  drop constraint if exists tournament_events_max_vip_players_check;

alter table public.tournament_events
  add constraint tournament_events_max_vip_players_check
    check (max_vip_players is null or max_vip_players >= 0);
