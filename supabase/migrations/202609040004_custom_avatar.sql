-- A photo the player chose themselves.
--
-- Avatars are pulled from Telegram once a week, which is right for a player who never
-- thought about it and wrong for one who uploaded a picture of their own: the weekly
-- sync would put the Telegram photo back. The flag says whose photo is on the profile,
-- and the sync leaves a chosen one alone.

alter table public.client_bot_users
  add column if not exists avatar_is_custom boolean not null default false;
