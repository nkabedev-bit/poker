insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tournament-sounds',
  'tournament-sounds',
  true,
  1048576,
  array[
    'audio/aac',
    'audio/mp3',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'audio/x-wav'
  ]
)
on conflict (id) do nothing;

create policy "authenticated sound uploads"
on storage.objects for insert to authenticated
with check (bucket_id = 'tournament-sounds');

create policy "authenticated sound updates"
on storage.objects for update to authenticated
using (bucket_id = 'tournament-sounds')
with check (bucket_id = 'tournament-sounds');

create policy "authenticated sound deletes"
on storage.objects for delete to authenticated
using (bucket_id = 'tournament-sounds');

create policy "public sound reads"
on storage.objects for select to anon, authenticated
using (bucket_id = 'tournament-sounds');
