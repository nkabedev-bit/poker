-- Who won the club's draws, kept past the evening.
--
-- The draw lowers the chance of a recent winner so the prizes go round the room: a
-- fifth of the usual weight on the evening of the win, back in full after five evenings
-- with a draw. The evening's own draw history is wiped at the finish, so the wins that
-- weighting reads live here.
--
-- Written by the server with the service role only; nobody else reads it.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

create table if not exists public.raffle_winners (
  id uuid primary key default gen_random_uuid(),
  raffle_id text unique,
  kind text not null check (kind in ('regular', 'vip')),
  -- The Moscow date of the evening, which is how draws are counted.
  played_on date not null,
  account_id uuid,
  telegram_id bigint,
  player_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists raffle_winners_played_on_idx
  on public.raffle_winners (played_on desc);

alter table public.raffle_winners enable row level security;

-- The free-pass draws already held, from the "Проходки" ledger. The VIP draws were never
-- written down anywhere, so they start counting from the next one. These rows carry no
-- account and are matched to players by nickname.
insert into public.raffle_winners (raffle_id, kind, played_on, player_name)
values
  ('ledger-2026-09-08-regular', 'regular', '2026-09-08', 'chak'),
  ('ledger-2026-09-10-regular', 'regular', '2026-09-10', '1$'),
  ('ledger-2026-09-12-regular', 'regular', '2026-09-12', 'киберпсих'),
  ('ledger-2026-09-13-regular', 'regular', '2026-09-13', 'Quepasa D'),
  ('ledger-2026-09-15-regular', 'regular', '2026-09-15', '1$')
on conflict (raffle_id) do nothing;
