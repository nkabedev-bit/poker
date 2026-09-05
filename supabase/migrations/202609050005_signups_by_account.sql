-- The sign-up belongs to an account, not to a Telegram id.
--
-- Ships with the code that reads the new columns, which is why it is separate from
-- 202609050004: that one added them and left the old keys standing, so the routines
-- running in production went on upserting against `(event_id, telegram_id)` until the
-- deploy caught up. Now nothing reads them, and a Telegram id is no longer something
-- every player has.

alter table public.event_signups
  drop constraint if exists event_signups_event_id_telegram_id_key;

alter table public.event_signups
  drop constraint if exists event_signups_telegram_id_fkey;

alter table public.event_signups
  alter column telegram_id drop not null;

-- The pair columns keyed by Telegram id go the same way. The values stay in place: they
-- are what 202609050004 read to fill the account columns beside them, and they cost
-- nothing to keep as a record of how the row was written.
alter table public.event_signups
  drop constraint if exists event_signups_duo_partner_telegram_id_fkey;

alter table public.event_signups
  drop constraint if exists event_signups_duo_host_telegram_id_fkey;

drop index if exists public.event_signups_duo_partner_once;
drop index if exists public.event_signups_duo_host_idx;
