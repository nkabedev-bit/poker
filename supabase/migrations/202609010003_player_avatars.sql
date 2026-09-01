-- Player avatars for the rating table.
--
-- Telegram hands a mini-app the photo of the player who opened it and nobody else,
-- so every other row would show a letter forever. The bot fetches each player's
-- profile photo through the Bot API and stores it, which is the only way the club
-- standings can show real faces.

alter table public.client_bot_users
  add column if not exists avatar_url text,
  add column if not exists avatar_synced_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-avatars',
  'player-avatars',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "service player avatar writes"
on storage.objects for insert to authenticated
with check (bucket_id = 'player-avatars');

create policy "service player avatar updates"
on storage.objects for update to authenticated
using (bucket_id = 'player-avatars')
with check (bucket_id = 'player-avatars');

create policy "service player avatar deletes"
on storage.objects for delete to authenticated
using (bucket_id = 'player-avatars');

create policy "public player avatar reads"
on storage.objects for select to anon, authenticated
using (bucket_id = 'player-avatars');
