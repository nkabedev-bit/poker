-- Free entries.
--
-- The club hands out entries to a tournament: a regular one covers a regular ticket, a
-- VIP one covers a VIP ticket, and neither covers a re-entry or an add-on — a pass is
-- worth exactly one seat at the start of a game.
--
-- Counters only, by decision: the club wants to know how many a player holds, not who
-- issued which one when.

alter table public.client_bot_users
  add column if not exists free_entries integer not null default 0 check (free_entries >= 0),
  add column if not exists vip_free_entries integer not null default 0
    check (vip_free_entries >= 0);

-- What the player chose when signing up. The pass is only spent when they turn up and
-- are seated, so an intention recorded here costs nothing if they never come.
alter table public.event_signups
  add column if not exists use_pass text not null default 'none'
    check (use_pass in ('none', 'regular', 'vip'));
