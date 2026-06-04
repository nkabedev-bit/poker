alter table public.bounty_log
add column if not exists mystery_bounty_points numeric not null default 0;
