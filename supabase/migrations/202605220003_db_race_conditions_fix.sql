create or replace function public.update_tournament_player(
  p_tournament_id uuid,
  p_player_id text,
  p_patch jsonb
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
  item jsonb;
  updated_player jsonb := null;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return null;
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' = p_player_id then
      updated_player := item || p_patch;
      updated_players := updated_players || updated_player;
    else
      updated_players := updated_players || item;
    end if;
  end loop;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated_player;
end;
$$;

revoke all on function public.update_tournament_player(uuid, text, jsonb) from public;
grant execute on function public.update_tournament_player(uuid, text, jsonb) to authenticated, service_role;


create or replace function public.delete_tournament_player(
  p_tournament_id uuid,
  p_player_id text
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
  item jsonb;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return '[]'::jsonb;
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' != p_player_id then
      updated_players := updated_players || item;
    end if;
  end loop;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated_players;
end;
$$;

revoke all on function public.delete_tournament_player(uuid, text) from public;
grant execute on function public.delete_tournament_player(uuid, text) to authenticated, service_role;


create or replace function public.add_tournament_player_addon(
  p_tournament_id uuid,
  p_player_id text,
  p_chips integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  players_list jsonb;
  settings_data jsonb;
  max_addons integer;
  updated_players jsonb := '[]'::jsonb;
  item jsonb;
  addons integer;
  addon_chips_total integer;
  current_stack integer;
  updated_player jsonb := null;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return null;
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);
  settings_data := coalesce(extras_row.data->'settings', '{}'::jsonb);
  max_addons := greatest(1, coalesce((settings_data->>'maxAddons')::integer, 1));

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' = p_player_id then
      addons := coalesce((item->>'addons')::integer, 0);
      if addons >= max_addons then
        updated_players := updated_players || item;
      else
        addon_chips_total := coalesce((item->>'addonChipsTotal')::integer, 0) + p_chips;
        current_stack := coalesce((item->>'stack')::integer, 0) + p_chips;
        updated_player := item || jsonb_build_object(
          'addons', addons + 1,
          'addonChipsTotal', addon_chips_total,
          'stack', current_stack
        );
        updated_players := updated_players || updated_player;
      end if;
    else
      updated_players := updated_players || item;
    end if;
  end loop;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated_player;
end;
$$;

revoke all on function public.add_tournament_player_addon(uuid, text, integer) from public;
grant execute on function public.add_tournament_player_addon(uuid, text, integer) to authenticated, service_role;


create or replace function public.move_tournament_player(
  p_tournament_id uuid,
  p_player_id text,
  p_table integer
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
  item jsonb;
  updated_player jsonb := null;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return null;
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' = p_player_id then
      updated_player := item || jsonb_build_object('table', p_table);
      updated_players := updated_players || updated_player;
    else
      updated_players := updated_players || item;
    end if;
  end loop;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated_player;
end;
$$;

revoke all on function public.move_tournament_player(uuid, text, integer) from public;
grant execute on function public.move_tournament_player(uuid, text, integer) to authenticated, service_role;


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
  finish_place integer := null;
  tournament_finished boolean := false;
  survivor_id text := null;
  item jsonb;
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
    if coalesce(item->>'status', '') = 'active' then
      active_count := active_count + 1;
    end if;
  end loop;

  if not p_uses_reentry then
    finish_place := active_count;
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


create or replace function public.cancel_player_elimination(
  p_tournament_id uuid,
  p_eliminated_id text,
  p_finish_place integer,
  p_killers jsonb,
  p_mystery_points numeric,
  p_uses_reentry boolean,
  p_players_before jsonb
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
  item jsonb;
  pid text;
  bounty_share numeric;
  bounty_chips numeric;
  mystery_share numeric;
  restored_finish_place integer;
  new_count integer;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return '[]'::jsonb;
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);
  restored_finish_place := p_finish_place;

  if p_players_before is not null and jsonb_typeof(p_players_before) = 'array' then
    updated_players := p_players_before;
    for item in select * from jsonb_array_elements(players_list) loop
      select count(*) into new_count
      from jsonb_array_elements(p_players_before) as pb
      where pb->>'id' = item->>'id';
      
      if new_count = 0 then
        updated_players := updated_players || item;
      end if;
    end loop;
  else
    for item in select * from jsonb_array_elements(players_list) loop
      pid := item->>'id';

      if pid = p_eliminated_id then
        if p_uses_reentry then
          item := item || jsonb_build_object(
            'rebuys', greatest(0, coalesce((item->>'rebuys')::integer, 0) - 1)
          );
        else
          item := item || jsonb_build_object(
            'finishPlace', null,
            'status', 'active'
          );
        end if;
      end if;

      if not p_uses_reentry and restored_finish_place is not null and restored_finish_place > 0 then
        if coalesce(item->>'status', '') = 'eliminated' 
           and item->>'finishPlace' is not null 
           and (item->>'finishPlace')::integer > 0 
           and (item->>'finishPlace')::integer < restored_finish_place then
          item := item || jsonb_build_object(
            'finishPlace', (item->>'finishPlace')::integer + 1
          );
        end if;
      end if;

      if not p_uses_reentry and restored_finish_place = 2 then
        if coalesce((item->>'finishPlace')::integer, 0) = 1 then
          item := item || jsonb_build_object('finishPlace', null);
        end if;
      end if;

      bounty_share := 0;
      bounty_chips := 0;
      mystery_share := 0;

      if p_killers is not null and jsonb_typeof(p_killers) = 'array' then
        select 
          coalesce(sum((k->>'share')::numeric), 0),
          coalesce(sum(coalesce((k->>'bountyChips')::numeric, 0)), 0),
          coalesce(sum((k->>'share')::numeric * coalesce(p_mystery_points, 0)), 0)
        into bounty_share, bounty_chips, mystery_share
        from jsonb_array_elements(p_killers) as k
        where k->>'id' = pid;
      end if;

      if bounty_share > 0 then
        item := item || jsonb_build_object(
          'bountyChipsTotal', greatest(0, round(coalesce((item->>'bountyChipsTotal')::numeric, 0) - bounty_chips, 6)),
          'bountyCount', greatest(0, round(coalesce((item->>'bountyCount')::numeric, 0) - bounty_share, 6)),
          'stack', greatest(0, round(coalesce((item->>'stack')::numeric, 0) - bounty_chips, 6))
        );
      end if;

      if mystery_share > 0 then
        item := item || jsonb_build_object(
          'mysteryBountyPoints', greatest(0, round(coalesce((item->>'mysteryBountyPoints')::numeric, 0) - mystery_share, 2))
        );
      end if;

      updated_players := updated_players || item;
    end loop;
  end if;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated_players;
end;
$$;

revoke all on function public.cancel_player_elimination(uuid, text, integer, jsonb, numeric, boolean, jsonb) from public;
grant execute on function public.cancel_player_elimination(uuid, text, integer, jsonb, numeric, boolean, jsonb) to authenticated, service_role;
