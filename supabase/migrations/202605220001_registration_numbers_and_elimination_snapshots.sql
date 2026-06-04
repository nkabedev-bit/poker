alter table public.bounty_log
add column if not exists uses_reentry boolean not null default false,
add column if not exists players_before jsonb,
add column if not exists players_after jsonb,
add column if not exists sheets_row_id integer,
add column if not exists sheets_sheet_name text;

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

  select coalesce(array_agg((player_item->>'registrationNumber')::integer), '{}'::integer[])
  into used_numbers
  from jsonb_array_elements(players_data) as player_item
  where (player_item->>'registrationNumber') ~ '^[0-9]+$';

  for candidate in 1..max_number loop
    if p_table_number = 3 then
      if candidate < 15 or candidate > 21 then
        continue;
      end if;
    else
      if candidate >= 15 and candidate <= 21 then
        continue;
      end if;
    end if;

    if not candidate = any(used_numbers) then
      next_player := p_player
        || jsonb_build_object(
          'registrationNumber', candidate,
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
