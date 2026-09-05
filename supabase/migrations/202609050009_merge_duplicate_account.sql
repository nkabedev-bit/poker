-- One player, two accounts: they changed their Telegram and the club got a second row.
--
-- Both are "1$" — same questionnaire, same birth date, same phone. Their games were
-- never split, because a result is matched by nickname as well as by Telegram id, so
-- the profile has always shown all of them. What did split is what lives on the account
-- row itself: the counters.
--
-- The newer account survives — it is the Telegram the player uses now, so the bot can
-- reach them and the mini-app knows them. Counts are added together, bests keep the
-- better of the two, and the older row goes.
--
-- Written down here because it happened to the club's data, not because a fresh database
-- would need it: on one, both ids are absent and every statement below does nothing.

-- Everything the old row counted, carried onto the one that stays.
update public.client_bot_users as keep
set
  free_entries = keep.free_entries + gone.free_entries,
  vip_free_entries = keep.vip_free_entries + gone.vip_free_entries,
  games_played = keep.games_played + gone.games_played,
  eliminations_count = keep.eliminations_count + gone.eliminations_count,
  top7_count = keep.top7_count + gone.top7_count,
  top18_count = keep.top18_count + gone.top18_count,
  top3_count = keep.top3_count + gone.top3_count,
  wins_count = keep.wins_count + gone.wins_count,
  last_place_count = keep.last_place_count + gone.last_place_count,
  -- A best is the better of the two, never their sum; a streak that is still running
  -- belongs to the account still playing.
  best_tournament_bounty = greatest(keep.best_tournament_bounty, gone.best_tournament_bounty),
  best_top9_streak = greatest(keep.best_top9_streak, gone.best_top9_streak),
  best_miss_streak = greatest(keep.best_miss_streak, gone.best_miss_streak),
  -- Medals from both, and where both hold the same one, the larger tally.
  medals = (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from (
      select key, max(value::int) as value
      from (
        select * from jsonb_each_text(coalesce(keep.medals, '{}'::jsonb))
        union all
        select * from jsonb_each_text(coalesce(gone.medals, '{}'::jsonb))
      ) both_rows
      group by key
    ) merged
  ),
  -- Whatever only the old row had.
  avatar_url = coalesce(keep.avatar_url, gone.avatar_url),
  avatar_thumb_url = coalesce(keep.avatar_thumb_url, gone.avatar_thumb_url),
  yandex_id = coalesce(keep.yandex_id, gone.yandex_id),
  email = coalesce(keep.email, gone.email),
  profile_submitted_at = coalesce(keep.profile_submitted_at, gone.profile_submitted_at),
  pending_profile_answers = coalesce(keep.pending_profile_answers, gone.pending_profile_answers)
from public.client_bot_users as gone
where keep.id = '0532e710-7675-4029-b42f-33e09d22ae4d'
  and gone.id = '3a586fca-3bdd-41e4-b4c3-14f415b29b9e';

-- Sign-ups written against the old account move over. There are none today; this is here
-- so the statement means the same thing if it is ever read as a recipe.
update public.event_signups
set user_id = '0532e710-7675-4029-b42f-33e09d22ae4d'
where user_id = '3a586fca-3bdd-41e4-b4c3-14f415b29b9e'
  and not exists (
    select 1 from public.event_signups other
    where other.event_id = event_signups.event_id
      and other.user_id = '0532e710-7675-4029-b42f-33e09d22ae4d'
  );

update public.event_signups
set duo_partner_user_id = '0532e710-7675-4029-b42f-33e09d22ae4d'
where duo_partner_user_id = '3a586fca-3bdd-41e4-b4c3-14f415b29b9e';

update public.event_signups
set duo_host_user_id = '0532e710-7675-4029-b42f-33e09d22ae4d'
where duo_host_user_id = '3a586fca-3bdd-41e4-b4c3-14f415b29b9e';

-- Results carry a Telegram id where they were recorded with one, and the nickname
-- otherwise. Repointed so nothing depends on a row that is about to go.
update public.tournament_results
set telegram_id = 887638103
where telegram_id = 6535235433;

delete from public.client_bot_users
where id = '3a586fca-3bdd-41e4-b4c3-14f415b29b9e';
