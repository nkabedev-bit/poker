alter table public.client_bot_users
add column if not exists pending_display_name text;

alter table public.client_bot_users
drop constraint if exists client_bot_users_state_check;

alter table public.client_bot_users
add constraint client_bot_users_state_check
check (state in (
  'idle',
  'awaiting_registration_code',
  'awaiting_registration_name',
  'awaiting_nickname_confirmation',
  'awaiting_registration_table'
));
