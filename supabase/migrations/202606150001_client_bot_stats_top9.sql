-- Count top-9 finishes instead of top-7 in the per-player achievement stats.
-- Everything else in accumulate_client_bot_stats is unchanged. The persisted
-- counter column keeps its historical name (top7_count) to avoid an app/migration
-- deploy-ordering outage; it now tracks top-9 placements.
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
      v_bounty_count := (item->>'bountyCount')::numeric;
    end if;

    update public.client_bot_users
    set
      games_played = games_played + 1,
      eliminations_count = round(eliminations_count + greatest(v_bounty_count, 0), 6),
      top7_count = top7_count + (case when v_finish_place between 1 and 9 then 1 else 0 end)
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
