-- Inviting somebody the club has never met to be the +1 of a pair.
--
-- A "1+1" could only be shared with a member the app already knew, or with a guest who
-- stayed a name on the buyer's sign-up — no account, no profile, no rating. The friend
-- worth bringing is exactly the one who has not joined yet.
--
-- The buyer gets a link instead. Whoever opens it registers, and the ticket's second
-- half becomes theirs. The token lives on the buyer's own sign-up, so cancelling the
-- ticket takes the invitation with it, and it is spent the moment it is used.

alter table public.event_signups
  add column if not exists duo_invite_token text;

create unique index if not exists event_signups_duo_invite_token_key
  on public.event_signups (duo_invite_token)
  where duo_invite_token is not null;
