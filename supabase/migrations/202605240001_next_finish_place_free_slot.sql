create or replace function public.record_player_elimination(
  p_tournament_id uuid,
  p_eliminated_id text,
  p_killers jsonb,
  p_bounty_chip_award numeric,
  p_mystery_points numeric,
  p_uses_reentry boolean,
  p_is_bounty boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  players_list jsonb;
  updated_players jsonb := '[]'::jsonb;
  active_count integer := 0;
  total_players integer := 0;
  occupied_finish_places integer[] := array[]::integer[];
  finish_place integer := null;
  candidate_place integer;
  tournament_finished boolean := false;
  survivor_id text := null;
  item jsonb;
  item_finish_place integer;
  pid text;
  bounty_share numeric;
  bounty_chips numeric;
  mystery_share numeric;
  new_rebuys integer;
  save_players jsonb;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament extras not found' using errcode = 'P0002';
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  for item in select * from jsonb_array_elements(players_list) loop
    total_players := total_players + 1;

    if coalesce(item->>'status', '') = 'active' then
      active_count := active_count + 1;
    end if;

    if coalesce(item->>'finishPlace', '') ~ '^[0-9]+$' then
      item_finish_place := (item->>'finishPlace')::integer;
      if item_finish_place > 1 then
        occupied_finish_places := array_append(occupied_finish_places, item_finish_place);
      end if;
    end if;
  end loop;

  if not p_uses_reentry then
    finish_place := active_count;
    candidate_place := active_count;

    while candidate_place <= greatest(active_count, total_players) loop
      if not candidate_place = any(occupied_finish_places) then
        finish_place := candidate_place;
        exit;
      end if;

      candidate_place := candidate_place + 1;
    end loop;

    if active_count = 2 then
      tournament_finished := true;
      for item in select * from jsonb_array_elements(players_list) loop
        if coalesce(item->>'status', '') = 'active' and item->>'id' != p_eliminated_id then
          survivor_id := item->>'id';
        end if;
      end loop;
    end if;
  end if;

  for item in select * from jsonb_array_elements(players_list) loop
    pid := item->>'id';

    if pid = p_eliminated_id then
      if p_uses_reentry then
        new_rebuys := coalesce((item->>'rebuys')::integer, 0) + 1;
        item := item || jsonb_build_object('rebuys', new_rebuys);
      else
        item := item || jsonb_build_object(
          'status', 'eliminated',
          'finishPlace', finish_place
        );
      end if;
    end if;

    if tournament_finished and pid = survivor_id then
      item := item || jsonb_build_object('finishPlace', 1);
    end if;

    bounty_share := 0;
    bounty_chips := 0;
    mystery_share := 0;

    if p_killers is not null and jsonb_typeof(p_killers) = 'array' then
      select
        coalesce(sum((k->>'share')::numeric), 0),
        coalesce(sum((k->>'share')::numeric * coalesce(p_bounty_chip_award, 0)), 0),
        coalesce(sum((k->>'share')::numeric * coalesce(p_mystery_points, 0)), 0)
      into bounty_share, bounty_chips, mystery_share
      from jsonb_array_elements(p_killers) as k
      where k->>'id' = pid;
    end if;

    if bounty_share > 0 and p_is_bounty then
      item := item || jsonb_build_object(
        'bountyChipsTotal', round(coalesce((item->>'bountyChipsTotal')::numeric, 0) + bounty_chips, 6),
        'bountyCount', round(coalesce((item->>'bountyCount')::numeric, 0) + bounty_share, 6),
        'stack', round(coalesce((item->>'stack')::numeric, 0) + bounty_chips, 6)
      );
    end if;

    if mystery_share > 0 then
      item := item || jsonb_build_object(
        'mysteryBountyPoints', round(coalesce((item->>'mysteryBountyPoints')::numeric, 0) + mystery_share, 2)
      );
    end if;

    updated_players := updated_players || item;
  end loop;

  save_players := updated_players;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', save_players)
  where tournament_id = p_tournament_id;

  return jsonb_build_object(
    'players', updated_players,
    'finishPlace', finish_place,
    'tournamentFinished', tournament_finished
  );
end;
$$;

revoke all on function public.record_player_elimination(uuid, text, jsonb, numeric, numeric, boolean, boolean) from public;
grant execute on function public.record_player_elimination(uuid, text, jsonb, numeric, numeric, boolean, boolean) to authenticated, service_role;
