-- Venue cards.
--
-- A card belongs to the club, not to a player: it is handed out at the door, carried
-- through the evening and returned at the end. The card itself holds nothing but its
-- printed code — the ticket type, the re-entries and the add-ons live with the player,
-- so a lost or swapped card can never lose what someone actually bought.
--
-- Both functions rewrite the players array under a row lock, the same way the rest of
-- the roster is edited, so issuing a card cannot race an elimination.

create or replace function public.assign_player_card(
  p_tournament_id uuid,
  p_player_id text,
  p_card_code text,
  p_ticket_type text
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
  assigned jsonb := null;
  holder text := null;
begin
  if p_ticket_type not in ('regular', 'vip') then
    raise exception 'Unknown ticket type: %', p_ticket_type using errcode = 'P0001';
  end if;

  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament extras not found' using errcode = 'P0002';
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  -- The same card cannot be out with two players at once.
  for item in select * from jsonb_array_elements(players_list) loop
    if coalesce(item->>'cardCode', '') = p_card_code and item->>'id' <> p_player_id then
      holder := coalesce(item->>'name', 'другой игрок');
    end if;
  end loop;

  if holder is not null then
    raise exception 'Card already issued to %', holder using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' = p_player_id then
      item := item || jsonb_build_object('cardCode', p_card_code, 'ticketType', p_ticket_type);
      assigned := item;
    end if;

    updated_players := updated_players || item;
  end loop;

  if assigned is null then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return assigned;
end;
$$;

create or replace function public.release_player_card(
  p_tournament_id uuid,
  p_card_code text
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
  released jsonb := null;
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
    if coalesce(item->>'cardCode', '') = p_card_code then
      released := item;
      -- The ticket type stays on the player: it is what they bought, not what the
      -- plastic knows.
      item := item - 'cardCode';
    end if;

    updated_players := updated_players || item;
  end loop;

  if released is null then
    return null;
  end if;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return released;
end;
$$;

revoke all on function public.assign_player_card(uuid, text, text, text) from public;
revoke all on function public.release_player_card(uuid, text) from public;
grant execute on function public.assign_player_card(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.release_player_card(uuid, text) to authenticated, service_role;
