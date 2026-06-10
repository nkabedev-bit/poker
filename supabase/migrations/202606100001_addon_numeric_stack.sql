-- Fix: add-on via the TMA player card returned 500 for any player who had recorded at
-- least one knockout in a bounty game. record_player_elimination stores the killer's stack
-- as round(numeric, 6), which jsonb renders as e.g. 40500.000000 (or a genuinely fractional
-- 40500.5 after a split bounty). The old add_tournament_player_addon cast that text with
-- ::integer, which throws "invalid input syntax for type integer". Read chip values as
-- numeric and round to 6 like the elimination function; addons/maxAddons go through a
-- numeric floor so a stray decimal can never crash the call either.
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
  addon_chips_total numeric;
  current_stack numeric;
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
  max_addons := greatest(1, coalesce(floor((settings_data->>'maxAddons')::numeric)::integer, 1));

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' = p_player_id then
      addons := coalesce(floor((item->>'addons')::numeric)::integer, 0);
      if addons >= max_addons then
        updated_players := updated_players || item;
      else
        addon_chips_total := round(coalesce((item->>'addonChipsTotal')::numeric, 0) + p_chips, 6);
        current_stack := round(coalesce((item->>'stack')::numeric, 0) + p_chips, 6);
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
