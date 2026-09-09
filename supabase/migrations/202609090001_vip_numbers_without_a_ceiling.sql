-- VIP numbers run out of the club's hands, not out of the table arithmetic.
--
-- The range was 21 to 30, and the loop that handed numbers out stopped at
-- tables_count * max_players_per_table. Both ends were wrong. On a night played at
-- nine-seat tables the loop stopped at 27, so seven VIP numbers existed for nine VIP
-- chairs; and a VIP ticket seated at a regular table takes a VIP number too, so even ten
-- ran out while the VIP table still had chairs. The guest was refused with
-- "No registration numbers available" and could not be seated at all.
--
-- Now the two ranges are named instead of derived: 1 to 20 is the regular one, and
-- everything above 20 is VIP with no end to it. A number handed back when a ticket
-- changed stays out of circulation for the rest of the evening — calling two people
-- "number 24" over one night is worse than skipping a number.
--
-- Mirrors lib/player-registration-number.ts and lib/tournament-player-registration.ts.

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
  ticket_type text;
  takes_vip_number boolean;
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

  ticket_type := p_player->>'ticketType';
  takes_vip_number := case
    when ticket_type = 'vip' then true
    when ticket_type = 'regular' then false
    else p_table_number = 3
  end;

  -- Every number spoken for tonight: the ones players are called by, and the ones they
  -- were called by before a ticket changed under them.
  select coalesce(array_agg(number), '{}'::integer[])
  into used_numbers
  from (
    select (player_item->>'registrationNumber')::integer as number
    from jsonb_array_elements(players_data) as player_item
    where (player_item->>'registrationNumber') ~ '^[0-9]+$'
    union
    select previous::integer
    from jsonb_array_elements(players_data) as player_item,
      lateral jsonb_array_elements_text(
        case
          when jsonb_typeof(player_item->'previousRegistrationNumbers') = 'array'
            then player_item->'previousRegistrationNumbers'
          else '[]'::jsonb
        end
      ) as previous
    where previous ~ '^[0-9]+$'
  ) as numbers;

  if takes_vip_number then
    -- The VIP range has no ceiling: there is always a next number above 20.
    candidate := 21;
    while candidate = any(used_numbers) loop
      candidate := candidate + 1;
    end loop;
  else
    candidate := null;
    for regular_number in 1..20 loop
      if not regular_number = any(used_numbers) then
        candidate := regular_number;
        exit;
      end if;
    end loop;

    if candidate is null then
      raise exception 'Regular registration numbers exhausted' using errcode = 'P0001';
    end if;
  end if;

  next_player := p_player
    || jsonb_build_object(
      'registrationNumber', candidate,
      'category', case when candidate >= 21 then 'VIP' else 'Normal' end,
      'table', p_table_number
    );

  update public.tournament_extras
  set data = extras_data || jsonb_build_object('players', players_data || jsonb_build_array(next_player))
  where tournament_id = p_tournament_id;

  return next_player;
end;
$$;

revoke all on function public.append_tournament_player(uuid, jsonb, integer, integer, integer) from public;
grant execute on function public.append_tournament_player(uuid, jsonb, integer, integer, integer) to authenticated, service_role;
