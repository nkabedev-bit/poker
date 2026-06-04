alter table public.client_bot_users
add column if not exists pending_profile_answers jsonb not null default '{}'::jsonb;

alter table public.client_bot_users
add column if not exists profile_submitted_at timestamptz;

alter table public.client_bot_users
drop constraint if exists client_bot_users_state_check;

alter table public.client_bot_users
add constraint client_bot_users_state_check
check (state in (
  'idle',
  'awaiting_profile_full_name',
  'awaiting_profile_nickname',
  'awaiting_profile_phone',
  'awaiting_profile_birth_date',
  'awaiting_profile_rating_consent',
  'awaiting_profile_discovery_source',
  'awaiting_profile_notifications_consent',
  'awaiting_profile_agreement',
  'awaiting_profile_nickname_confirmation',
  'awaiting_profile_nickname_fix',
  'awaiting_registration_code',
  'awaiting_registration_name',
  'awaiting_nickname_confirmation',
  'awaiting_registration_table'
));

grant select, insert, update, delete on table public.client_bot_users to authenticated, service_role;
