-- Seating a player who is already in the tournament.
--
-- A walk-in typed in by hand lands at a table with no chair of its own — the roster
-- gave everyone seat 1 — so the seating plan showed one seat taken and nine free at a
-- table that had four people at it. Handing them a card now goes through the plan, and
-- this is what writes the chair down.
--
-- The seat is checked and written under one row lock, so two players cannot be sent to
-- the same chair by two taps at the door.

create or replace function public.seat_tournament_player(
  p_tournament_id uuid,
  p_player_id text,
  p_table integer,
  p_seat integer
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
  updated jsonb := null;
  holder text := null;
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
    if item->>'id' <> p_player_id
      and coalesce(item->>'status', '') = 'active'
      and coalesce((item->>'table')::integer, 0) = p_table
      and coalesce((item->>'seat')::integer, 0) = p_seat
    then
      holder := coalesce(item->>'name', 'другой игрок');
    end if;
  end loop;

  if holder is not null then
    raise exception 'Seat already taken by %', holder using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' = p_player_id then
      item := item || jsonb_build_object('table', p_table, 'seat', p_seat);
      updated := item;
    end if;

    updated_players := updated_players || item;
  end loop;

  if updated is null then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated;
end;
$$;

revoke all on function public.seat_tournament_player(uuid, text, integer, integer) from public;
grant execute on function public.seat_tournament_player(uuid, text, integer, integer) to authenticated, service_role;
