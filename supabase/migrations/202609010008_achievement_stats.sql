-- Достижения в клиентском мини-аппе: к посещениям, нокаутам и топ-9 добавляются
-- счётчики, которых раньше не было — топ-18, победы, последнее место, лучший результат
-- по баунти за один турнир и серии подряд (с финальным столом и без него).
-- Применять вручную в Supabase SQL editor.
--
-- Счётчики начинают заполняться с ближайшего турнира: за прошлые игры данных о местах и
-- баунти по игрокам не сохранялось, поэтому задним числом их не восстановить.

alter table public.client_bot_users
  add column if not exists top18_count integer not null default 0,
  add column if not exists wins_count integer not null default 0,
  add column if not exists last_place_count integer not null default 0,
  add column if not exists best_tournament_bounty numeric not null default 0,
  add column if not exists top9_streak integer not null default 0,
  add column if not exists best_top9_streak integer not null default 0,
  add column if not exists miss_streak integer not null default 0,
  add column if not exists best_miss_streak integer not null default 0;

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
    if coalesce(item->>'telegramId', '') !~ '^-?[0-9]+$' then
      continue;
    end if;

    v_telegram_id := (item->>'telegramId')::bigint;

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
      top18_count = top18_count + (case when v_finish_place between 1 and 18 then 1 else 0 end),
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
    where telegram_id = v_telegram_id;
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
