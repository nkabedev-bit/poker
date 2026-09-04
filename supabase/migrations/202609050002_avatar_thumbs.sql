-- A small copy of every face, for the lists that show dozens of them at once.
--
-- The rating table, the finishing table of a game and the partner search draw the
-- avatar 34 pixels across, and were handing out the full profile picture to do it —
-- twenty-odd kilobytes each, twenty-seven of them on one screen. The thumbnail is a
-- tenth of that, and the large copy stays for the profile, where it is actually seen.
--
-- The column is filled as photos are synced or uploaded; a player who has none yet
-- falls back to their full-size picture, so nothing looks broken in the meantime.

alter table public.client_bot_users
  add column if not exists avatar_thumb_url text;
