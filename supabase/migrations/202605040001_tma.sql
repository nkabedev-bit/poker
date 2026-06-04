create table public.tma_admins (
  telegram_id bigint primary key,
  name        text not null,
  added_by    bigint,
  added_at    timestamptz not null default now()
);

create table public.bounty_log (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments(id) on delete cascade,
  eliminated_id    uuid not null,
  eliminated_name  text not null,
  finish_place     integer,
  bounty_split     boolean not null default false,
  killers          jsonb not null default '[]',
  cancelled        boolean not null default false,
  cancelled_at     timestamptz,
  recorded_by      bigint,
  recorded_at      timestamptz not null default now()
);

alter table public.tma_admins enable row level security;
alter table public.bounty_log enable row level security;

create policy "authenticated tma_admins read"
on public.tma_admins for select to authenticated using (true);

create policy "authenticated bounty_log read"
on public.bounty_log for select to authenticated using (true);

create policy "authenticated bounty_log insert"
on public.bounty_log for insert to authenticated with check (true);

create policy "authenticated bounty_log update"
on public.bounty_log for update to authenticated using (true) with check (true);
