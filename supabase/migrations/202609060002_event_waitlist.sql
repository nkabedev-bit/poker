-- Standing in line for a ticket that is sold out.
--
-- A poster fills up and the club loses the player: nothing on the screen says "tell me
-- if a place comes free", so somebody who cancels an hour later frees a seat nobody
-- hears about.
--
-- The queue is kept as sign-ups of their own kind. A row already carries the ticket
-- somebody wanted, so a player waiting for a VIP seat is told when a VIP seat opens and
-- not when a regular one does — and the unique pair (event, player) means one place in
-- line each, without a table of its own to keep in step.
--
-- A place in line takes no seat: everything that counts the room asks for the sign-ups
-- that stand, and this status is not one of them.

alter table public.event_signups
  drop constraint if exists event_signups_status_check;

alter table public.event_signups
  add constraint event_signups_status_check
    check (status in ('signed_up', 'cancelled', 'seated', 'waitlist'));
