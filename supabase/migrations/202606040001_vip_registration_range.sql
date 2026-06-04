-- Move table 3 registration numbers from 15-21 to 19-27 and tag each player
-- with a VIP/Normal category derived from the assigned registration number.
create or replace function public.append_tournament_player(
  p_tournament_id uuid,
  p_player jsonb,
  p_table_number integer,
  p_tables_count integer,
  p_max_players_per_table integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_data jsonb;
  next_player jsonb;
  players_data jsonb;
  registered_count integer;
  used_numbers integer[];
  candidate integer;
  max_number integer;
begin
  insert into public.tournament_extras (tournament_id, data)
  values (p_tournament_id, '{}'::jsonb)
  on conflict (tournament_id) do nothing;

  select data
  into extras_data
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  players_data := coalesce(extras_data->'players', '[]'::jsonb);
  max_number := greatest(1, floor(coalesce(p_tables_count, 1))::integer)
    * greatest(1, floor(coalesce(p_max_players_per_table, 1))::integer);
  registered_count := jsonb_array_length(players_data);

  if registered_count >= max_number then
    raise exception 'Tournament capacity reached: % players registered', registered_count
      using errcode = 'P0001';
  end if;

  select coalesce(array_agg((player_item->>'registrationNumber')::integer), '{}'::integer[])
  into used_numbers
  from jsonb_array_elements(players_data) as player_item
  where (player_item->>'registrationNumber') ~ '^[0-9]+$';

  for candidate in 1..max_number loop
    if p_table_number = 3 then
      if candidate < 19 or candidate > 27 then
        continue;
      end if;
    else
      if candidate >= 19 and candidate <= 27 then
        continue;
      end if;
    end if;

    if not candidate = any(used_numbers) then
      next_player := p_player
        || jsonb_build_object(
          'registrationNumber', candidate,
          'category', case when candidate between 19 and 27 then 'VIP' else 'Normal' end,
          'table', p_table_number
        );
      exit;
    end if;
  end loop;

  if next_player is null then
    raise exception 'No registration numbers available'
      using errcode = 'P0001';
  end if;

  update public.tournament_extras
  set data = extras_data || jsonb_build_object('players', players_data || jsonb_build_array(next_player))
  where tournament_id = p_tournament_id;

  return next_player;
end;
$$;

revoke all on function public.append_tournament_player(uuid, jsonb, integer, integer, integer) from public;
grant execute on function public.append_tournament_player(uuid, jsonb, integer, integer, integer) to authenticated, service_role;
