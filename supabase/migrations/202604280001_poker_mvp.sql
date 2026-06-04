create extension if not exists pgcrypto;

create type public.registration_status as enum ('open', 'closed');
create type public.timer_status as enum ('not_started', 'running', 'paused', 'break', 'finished');

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Friday Night Poker',
  logo_url text,
  starting_stack integer not null default 10000 check (starting_stack > 0),
  registration_minutes integer not null default 180 check (registration_minutes >= 0),
  registration_status public.registration_status not null default 'open',
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.blind_levels (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  level_order integer not null check (level_order > 0),
  small_blind integer,
  big_blind integer,
  ante integer,
  duration_seconds integer not null check (duration_seconds > 0),
  is_break boolean not null default false,
  break_duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, level_order),
  check (
    (is_break = true and small_blind is null and big_blind is null)
    or
    (is_break = false and small_blind is not null and big_blind is not null)
  )
);

create table public.timer_state (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references public.tournaments(id) on delete cascade,
  status public.timer_status not null default 'not_started',
  current_level_index integer not null default 0 check (current_level_index >= 0),
  level_started_at timestamptz,
  paused_remaining_seconds integer,
  registration_closes_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tournaments_touch_updated_at
before update on public.tournaments
for each row execute function public.touch_updated_at();

create trigger blind_levels_touch_updated_at
before update on public.blind_levels
for each row execute function public.touch_updated_at();

create trigger timer_state_touch_updated_at
before update on public.timer_state
for each row execute function public.touch_updated_at();

alter table public.tournaments enable row level security;
alter table public.blind_levels enable row level security;
alter table public.timer_state enable row level security;

create policy "authenticated tournament read"
on public.tournaments for select to authenticated using (true);

create policy "authenticated tournament insert"
on public.tournaments for insert to authenticated with check (true);

create policy "authenticated tournament update"
on public.tournaments for update to authenticated using (true) with check (true);

create policy "authenticated tournament delete"
on public.tournaments for delete to authenticated using (true);

create policy "authenticated blind read"
on public.blind_levels for select to authenticated using (true);

create policy "authenticated blind insert"
on public.blind_levels for insert to authenticated with check (true);

create policy "authenticated blind update"
on public.blind_levels for update to authenticated using (true) with check (true);

create policy "authenticated blind delete"
on public.blind_levels for delete to authenticated using (true);

create policy "authenticated timer read"
on public.timer_state for select to authenticated using (true);

create policy "authenticated timer insert"
on public.timer_state for insert to authenticated with check (true);

create policy "authenticated timer update"
on public.timer_state for update to authenticated using (true) with check (true);

create policy "authenticated timer delete"
on public.timer_state for delete to authenticated using (true);

insert into public.tournaments (id, name, starting_stack, registration_minutes)
values ('00000000-0000-0000-0000-000000000001', 'POKER CLUB / DEMO', 10000, 180)
on conflict (id) do nothing;

insert into public.blind_levels (tournament_id, level_order, small_blind, big_blind, ante, duration_seconds, is_break)
values
  ('00000000-0000-0000-0000-000000000001', 1, 25, 50, null, 1200, false),
  ('00000000-0000-0000-0000-000000000001', 2, 50, 100, null, 1200, false),
  ('00000000-0000-0000-0000-000000000001', 3, 75, 150, null, 1200, false),
  ('00000000-0000-0000-0000-000000000001', 4, 100, 200, 25, 1200, false)
on conflict (tournament_id, level_order) do nothing;

insert into public.timer_state (tournament_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (tournament_id) do nothing;

create or replace function public.get_public_state(token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_record public.tournaments%rowtype;
  state_record public.timer_state%rowtype;
  levels_json jsonb;
begin
  select * into tournament_record
  from public.tournaments
  where public_token = token
  limit 1;

  if tournament_record.id is null then
    return null;
  end if;

  select * into state_record
  from public.timer_state
  where tournament_id = tournament_record.id
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(bl) order by bl.level_order), '[]'::jsonb)
  into levels_json
  from public.blind_levels bl
  where bl.tournament_id = tournament_record.id;

  return jsonb_build_object(
    'tournament', to_jsonb(tournament_record),
    'timerState', to_jsonb(state_record),
    'blindLevels', levels_json
  );
end;
$$;

revoke all on function public.get_public_state(text) from public;
grant execute on function public.get_public_state(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tournament-logos',
  'tournament-logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

create policy "authenticated logo uploads"
on storage.objects for insert to authenticated
with check (bucket_id = 'tournament-logos');

create policy "authenticated logo updates"
on storage.objects for update to authenticated
using (bucket_id = 'tournament-logos')
with check (bucket_id = 'tournament-logos');

create policy "authenticated logo deletes"
on storage.objects for delete to authenticated
using (bucket_id = 'tournament-logos');

create policy "public logo reads"
on storage.objects for select to anon, authenticated
using (bucket_id = 'tournament-logos');
