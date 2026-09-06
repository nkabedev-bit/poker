-- A ticket the club holds for a regular who asked ahead.
--
-- Somebody writes to the admin days before the poster goes up: "оставь мне место".
-- Until now the admin kept that in their head and let the player in at the door, which
-- meant the seat was sold twice as often as anybody wanted.
--
-- A reservation is a sign-up of its own kind: it holds a seat like any other, carries
-- the ticket the club promised, and becomes an ordinary sign-up the moment the player
-- confirms. It is the admin who makes it, so the player is told when the poster goes
-- up — and told once, which is what `notified_at` remembers.

alter table public.event_signups
  drop constraint if exists event_signups_status_check;

alter table public.event_signups
  add constraint event_signups_status_check
    check (status in ('signed_up', 'cancelled', 'seated', 'waitlist', 'reserved'));

alter table public.event_signups
  add column if not exists notified_at timestamptz;
