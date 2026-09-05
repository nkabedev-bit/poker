-- What the club tells everybody, kept where everybody can read it.
--
-- Announcements went out through the bot and nowhere else, so a player who signed in on
-- the web never heard them: no chat, no message. The posters they could always see —
-- those live in the app — but the ad-hoc word ("сегодня играем", "перенос на пятницу")
-- passed them by entirely.
--
-- Every broadcast now leaves a copy here, and the app shows it to everyone. Telegram
-- players get both: the message in the bot, as before, and the same line in the feed.

create table if not exists public.club_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists club_announcements_created_at_idx
  on public.club_announcements (created_at desc);

alter table public.club_announcements enable row level security;
-- No policies: the app reads these through the service role, the same way it reads
-- everything else a player is shown.

-- When this player last opened the feed. Null means they never have, and everything is
-- new to them.
alter table public.client_bot_users
  add column if not exists announcements_seen_at timestamptz;
