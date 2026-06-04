create table if not exists public.tournament_extras (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger tournament_extras_touch_updated_at
before update on public.tournament_extras
for each row execute function public.touch_updated_at();

alter table public.tournament_extras enable row level security;

create policy "authenticated extras read"
on public.tournament_extras for select to authenticated using (true);

create policy "authenticated extras insert"
on public.tournament_extras for insert to authenticated with check (true);

create policy "authenticated extras update"
on public.tournament_extras for update to authenticated using (true) with check (true);

insert into public.tournament_extras (tournament_id, data)
values ('00000000-0000-0000-0000-000000000001', '{}'::jsonb)
on conflict (tournament_id) do nothing;
