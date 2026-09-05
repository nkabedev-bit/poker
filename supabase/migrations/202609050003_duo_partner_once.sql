-- A club member is asked to be somebody's +1 once per evening.
--
-- Two buyers could name the same person on their own "1+1", and nothing anywhere said
-- no. The app then read the invitation with a single-row query and got two, so the
-- player it happened to could not open the tournament at all — the page failed before
-- it could show them either invitation.
--
-- Who asked first keeps them. The later ticket is left standing with its partner field
-- empty, exactly as it looks before a partner is picked, so the buyer chooses somebody
-- else without losing what they paid for.

with ranked as (
  select
    id,
    row_number() over (
      partition by event_id, duo_partner_telegram_id
      order by created_at, id
    ) as seat
  from public.event_signups
  where duo_partner_telegram_id is not null
    and status <> 'cancelled'
)
update public.event_signups as signup
set duo_confirmed_at = null,
    duo_partner_name = null,
    duo_partner_telegram_id = null
from ranked
where ranked.id = signup.id
  and ranked.seat > 1;

-- A cancelled ticket lets go of its partner, so the same player can be asked again on a
-- sign-up that still stands.
create unique index if not exists event_signups_duo_partner_once
  on public.event_signups (event_id, duo_partner_telegram_id)
  where duo_partner_telegram_id is not null and status <> 'cancelled';
