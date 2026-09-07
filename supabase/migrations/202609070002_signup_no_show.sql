-- The player who signed up and never came.
--
-- The room fills, a queue forms behind it, and then somebody simply does not turn up.
-- Their seat is free in the hall but spoken for on paper, so the desk had nothing to
-- hand the next person in line — cancelling the absent player would have said they
-- changed their mind, which is not what happened and not what the desk needs to read an
-- hour later when they walk in after all.
--
-- "no_show" is that seat, given away and still on the record: it takes no place (the
-- statuses that count the room do not include it), and the sign-up stays visible to the
-- desk marked for what it is.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

alter table public.event_signups
  drop constraint if exists event_signups_status_check;

alter table public.event_signups
  add constraint event_signups_status_check
    check (status in ('signed_up', 'cancelled', 'seated', 'waitlist', 'reserved', 'no_show'));
