-- Two kinds of ticket, counted apart.
--
-- A poster sells a regular seat and a VIP seat, and the club opens a different number
-- of each: nine tables of regulars and one VIP table. Until now the poster carried a
-- single limit and the player never said which ticket they wanted — the admin decided
-- at the door, which made the count of free seats a guess.
--
-- `max_players` keeps its meaning for the regular seats; `max_vip_players` is the VIP
-- table. A sign-up now records the ticket the player asked for, so both can be counted.

alter table public.tournament_events
  add column if not exists max_vip_players integer check (max_vip_players > 0);

alter table public.event_signups
  add column if not exists ticket_type text not null default 'regular'
    check (ticket_type in ('regular', 'vip'));
