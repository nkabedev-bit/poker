create table if not exists public.client_bot_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  chat_id bigint not null,
  username text,
  first_name text,
  last_name text,
  display_name text,
  state text not null default 'idle'
    check (state in ('idle', 'awaiting_registration_code', 'awaiting_registration_name')),
  registered_player_id text,
  registered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger client_bot_users_touch_updated_at
before update on public.client_bot_users
for each row execute function public.touch_updated_at();

alter table public.client_bot_users enable row level security;

create policy "authenticated client_bot_users read"
on public.client_bot_users for select to authenticated using (true);

create policy "authenticated client_bot_users insert"
on public.client_bot_users for insert to authenticated with check (true);

create policy "authenticated client_bot_users update"
on public.client_bot_users for update to authenticated using (true) with check (true);
