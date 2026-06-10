-- Fix: /givecolor and /removecolor used to read the whole tournament_extras JSON in the
-- bot, modify it in memory, and write it back wholesale — a concurrent registration /
-- elimination / add-on committed in between was silently overwritten (lost update). This
-- RPC does what every other tournament mutation already does: lock the row FOR UPDATE and
-- patch ONLY the label data (the playerLabels store + the live label of matching roster
-- players), leaving the rest of the document untouched.
--
-- p_label = null (or blank) removes the label; otherwise it is set. Nickname matching is
-- trim+lowercase, mirroring normalizePlayerLabelKey in lib/player-labels.ts.
create or replace function public.set_player_label(
  p_tournament_id uuid,
  p_nickname text,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  label_key text := lower(btrim(coalesce(p_nickname, '')));
  label_value text := nullif(btrim(coalesce(p_label, '')), '');
  labels jsonb;
  players_list jsonb;
  updated_players jsonb := '[]'::jsonb;
  item jsonb;
  matched integer := 0;
begin
  if label_key = '' then
    raise exception 'Nickname must not be empty';
  end if;

  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return null;
  end if;

  labels := coalesce(extras_row.data->'playerLabels', '{}'::jsonb);
  if label_value is null then
    labels := labels - label_key;
  else
    labels := jsonb_set(labels, array[label_key], to_jsonb(label_value), true);
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);
  for item in select * from jsonb_array_elements(players_list) loop
    if lower(btrim(coalesce(item->>'name', ''))) = label_key then
      matched := matched + 1;
      item := item || jsonb_build_object('label', label_value);
    end if;
    updated_players := updated_players || item;
  end loop;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object(
    'playerLabels', labels,
    'players', updated_players
  )
  where tournament_id = p_tournament_id;

  return jsonb_build_object('matched', matched);
end;
$$;

revoke all on function public.set_player_label(uuid, text, text) from public;
grant execute on function public.set_player_label(uuid, text, text) to authenticated, service_role;
