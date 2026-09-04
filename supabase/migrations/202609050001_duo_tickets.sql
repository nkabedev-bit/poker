-- The "1+1" ticket: one price, two players.
--
-- The club sells a couple of these an evening — 2000 ₽ for two, against 1250 ₽ for a
-- single seat — and until now there was nowhere to say who the second player is. The
-- pair was arranged in chat and the admin held it in their head.
--
-- A duo ticket is its own allotment, counted next to the regular and the VIP one: a
-- poster reads "16 regular · 1 duo · 9 VIP" and the three run out separately. The two
-- seats a duo ticket carries are already inside its own count, so the player who comes
-- as the +1 takes nothing further — otherwise the pair would be charged two seats twice.
--
-- The partner is either a member, matched by their Telegram id and confirmed by them,
-- or a guest from outside the club, who is only a name until they walk in.

alter table public.tournament_events
  add column if not exists duo_buy_in integer check (duo_buy_in >= 0);

alter table public.tournament_events
  add column if not exists max_duo_tickets integer check (max_duo_tickets >= 0);

alter table public.event_signups
  drop constraint if exists event_signups_ticket_type_check;

alter table public.event_signups
  add constraint event_signups_ticket_type_check
    check (ticket_type in ('regular', 'vip', 'duo', 'duo_plus_one'));

-- On the buyer's row: who they are bringing. A member is referenced by id, a guest is
-- written down as a name — the club needs no more than that to let them in.
alter table public.event_signups
  add column if not exists duo_partner_telegram_id bigint
    references public.client_bot_users(telegram_id) on delete set null;

alter table public.event_signups
  add column if not exists duo_partner_name text;

alter table public.event_signups
  add column if not exists duo_confirmed_at timestamptz;

-- On the +1's own row: who invited them, so cancelling the buyer takes the pair with it.
alter table public.event_signups
  add column if not exists duo_host_telegram_id bigint
    references public.client_bot_users(telegram_id) on delete cascade;

create index if not exists event_signups_duo_host_idx
  on public.event_signups (event_id, duo_host_telegram_id);
