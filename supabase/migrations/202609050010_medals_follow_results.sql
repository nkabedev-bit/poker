-- A medal belongs to a game, and follows it.
--
-- Medals were tallied onto the player the moment a tournament finished, and nothing
-- ever took one back: deleting the game from the results left the medal standing, and a
-- game never imported was never worth one either. Every other number on a profile — the
-- games, the wins, the streaks — is counted from the results themselves, precisely so
-- that correcting a game in the admin corrects the profile with it. Medals were the
-- one exception.
--
-- The result row now says which of the club's tournaments it was, and a first place in
-- it is the medal. Delete the game and the medal goes with it.
--
-- The `medals` column stays, and stops being written: it holds what the club won before
-- any of this was recorded, which no result row will ever account for. What a player
-- holds is that, plus what the results say.

alter table public.tournament_results
  add column if not exists medal_key text
    check (medal_key in (
      'phoenix', 'deepstack', 'bounty', 'progressive', 'mystery', 'freeroll', 'lastchance'
    ));

-- Only first places are ever counted, and only where the game had a type at all.
create index if not exists tournament_results_medal_idx
  on public.tournament_results (medal_key, player_key)
  where medal_key is not null and place = 1;

-- The accumulator stops keeping a medal tally: the results are the record now, and two
-- places counting the same win would double it.
create or replace function public.accumulate_client_bot_stats(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  item jsonb;
  v_telegram_id bigint;
  v_account_id uuid;
  v_finish_place integer;
  v_bounty_count numeric;
  v_is_top9 boolean;
  v_last_place integer;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return;
  end if;

  -- Already counted for this tournament instance.
  if coalesce(extras_row.data->'settings'->>'statsCountedAt', '') <> '' then
    return;
  end if;



  -- The last place of the tournament is its largest finish place: places are handed out
  -- from the bottom up, so the first player knocked out carries the biggest number.
  select max((p->>'finishPlace')::integer) into v_last_place
  from jsonb_array_elements(coalesce(extras_row.data->'players', '[]'::jsonb)) as p
  where coalesce(p->>'finishPlace', '') ~ '^[0-9]+$';

  for item in select * from jsonb_array_elements(coalesce(extras_row.data->'players', '[]'::jsonb)) loop
    -- A player seated from a sign-up carries the club account they signed up with;
    -- one who signed in on the web has no Telegram id at all, and the account is the
    -- only thing that finds them. A seat the admin typed in by hand has neither, and
    -- there is no profile to count the evening against.
    v_account_id := null;
    if coalesce(item->>'accountId', '') ~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_account_id := (item->>'accountId')::uuid;
    end if;

    v_telegram_id := null;
    if coalesce(item->>'telegramId', '') ~ '^-?[0-9]+$' then
      v_telegram_id := (item->>'telegramId')::bigint;
    end if;

    if v_account_id is null and v_telegram_id is null then
      continue;
    end if;

    v_finish_place := null;
    if coalesce(item->>'finishPlace', '') ~ '^[0-9]+$' then
      v_finish_place := (item->>'finishPlace')::integer;
    end if;

    v_bounty_count := 0;
    if coalesce(item->>'bountyCount', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
      v_bounty_count := greatest((item->>'bountyCount')::numeric, 0);
    end if;

    v_is_top9 := v_finish_place between 1 and 9;

    update public.client_bot_users
    set
      games_played = games_played + 1,
      eliminations_count = round(eliminations_count + v_bounty_count, 6),
      top7_count = top7_count + (case when v_is_top9 then 1 else 0 end),
      top3_count = top3_count + (case when v_finish_place between 1 and 3 then 1 else 0 end),
      wins_count = wins_count + (case when v_finish_place = 1 then 1 else 0 end),
      last_place_count = last_place_count
        + (case when v_last_place is not null and v_finish_place = v_last_place then 1 else 0 end),
      best_tournament_bounty = greatest(best_tournament_bounty, round(v_bounty_count, 6)),
      -- The right-hand side reads the values as they were before this update, so the
      -- current run either grows by one or resets, and the best run keeps the maximum.
      top9_streak = (case when v_is_top9 then top9_streak + 1 else 0 end),
      best_top9_streak = greatest(
        best_top9_streak,
        (case when v_is_top9 then top9_streak + 1 else 0 end)
      ),
      miss_streak = (case when v_is_top9 then 0 else miss_streak + 1 end),
      best_miss_streak = greatest(
        best_miss_streak,
        (case when v_is_top9 then 0 else miss_streak + 1 end)
      )
    where (v_account_id is not null and id = v_account_id)
       or (v_account_id is null and telegram_id = v_telegram_id);
  end loop;

  update public.tournament_extras
  set data = jsonb_set(
    data,
    '{settings,statsCountedAt}',
    to_jsonb(now()),
    true
  )
  where tournament_id = p_tournament_id;
end;
$$;

revoke all on function public.accumulate_client_bot_stats(uuid) from public;
grant execute on function public.accumulate_client_bot_stats(uuid) to authenticated, service_role;
