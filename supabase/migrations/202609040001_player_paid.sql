-- What a player has already paid.
--
-- Part of the room settles up during the break, so the admin needs to see who has paid
-- and who has not while the game is still running. The amount is stored, not a flag:
-- a player who paid before taking a re-entry owes again, and "paid" alone would hide it.
--
-- Written under the same row lock the rest of the roster uses, so marking a payment
-- cannot race a knockout.

create or replace function public.set_player_paid_amount(
  p_tournament_id uuid,
  p_player_id text,
  p_paid_amount numeric
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
      item := item || jsonb_build_object('paidAmount', greatest(0, coalesce(p_paid_amount, 0)));
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

revoke all on function public.set_player_paid_amount(uuid, text, numeric) from public;
grant execute on function public.set_player_paid_amount(uuid, text, numeric) to authenticated, service_role;
