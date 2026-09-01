-- Tournaments sell two kinds of ticket: a regular seat and a VIP one. The existing
-- buy_in column keeps the regular price, so nothing already entered has to move.
alter table public.tournament_events
  add column if not exists vip_buy_in integer check (vip_buy_in >= 0);
