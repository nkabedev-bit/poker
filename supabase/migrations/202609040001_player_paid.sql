-- Whether a player has paid for the evening.
--
-- Part of the room settles up during the break — the last one before re-entries and
-- add-ons close, so nothing is bought afterwards and the bill cannot change. A single
-- flag is enough: paid, or not.
--
-- Written under the same row lock the rest of the roster uses, so marking a payment
-- cannot race a knockout.

drop function if exists public.set_player_paid_amount(uuid, text, numeric);

create or replace function public.set_player_paid(
  p_tournament_id uuid,
  p_player_id text,
  p_paid boolean
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
    if item->>'id' = p_player_id then
      item := item || jsonb_build_object('paid', coalesce(p_paid, false));
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

revoke all on function public.set_player_paid(uuid, text, boolean) from public;
grant execute on function public.set_player_paid(uuid, text, boolean) to authenticated, service_role;
