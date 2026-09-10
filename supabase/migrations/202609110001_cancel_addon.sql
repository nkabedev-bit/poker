-- Отмена аддона, выданного по ошибке.
--
-- Админ иногда отмечает аддон не тому игроку. Отмена — обратная операция к
-- add_tournament_player_addon под тем же локом строки: минус один аддон, минус его фишки
-- со стека и из addonChipsTotal (из него экран считает банк фишек и средний стек).
-- Сколько фишек снимать, берётся из данных самого игрока — addonChipsTotal / addons, —
-- а не из настроек: settings.addonChips и реально начисляемые 6000 расходятся.
--
-- p_expected_addons — сколько аддонов видел админ, нажимая «Отменить». Повторный тап,
-- повтор запроса или второй админ с тем же экраном второй аддон не снимут: число уже не
-- совпадёт, и функция вернёт null, не трогая строку.
--
-- Чтение чисел только через ::numeric: стек после выбивания лежит как 40500.000000 или
-- дробным после сплита баунти (см. 202606100001_addon_numeric_stack).
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.
create or replace function public.cancel_tournament_player_addon(
  p_tournament_id uuid,
  p_player_id text,
  p_expected_addons integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  updated_players jsonb := '[]'::jsonb;
  item jsonb;
  addons integer;
  addon_chips_total numeric;
  chips_per_addon numeric;
  updated_player jsonb := null;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return null;
  end if;

  for item in select * from jsonb_array_elements(coalesce(extras_row.data->'players', '[]'::jsonb)) loop
    if item->>'id' = p_player_id then
      addons := coalesce(floor((item->>'addons')::numeric)::integer, 0);

      if addons >= 1 and addons = p_expected_addons then
        addon_chips_total := coalesce((item->>'addonChipsTotal')::numeric, 0);
        chips_per_addon := addon_chips_total / addons;
        item := item || jsonb_build_object(
          'addons', addons - 1,
          'addonChipsTotal', greatest(0, round(addon_chips_total - chips_per_addon, 6)),
          'stack', greatest(0, round(coalesce((item->>'stack')::numeric, 0) - chips_per_addon, 6))
        );
        updated_player := item;
      end if;
    end if;

    updated_players := updated_players || item;
  end loop;

  -- Отменять нечего: игрока нет, аддонов нет или экран админа устарел.
  if updated_player is null then
    return null;
  end if;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated_player;
end;
$$;

revoke all on function public.cancel_tournament_player_addon(uuid, text, integer) from public;
grant execute on function public.cancel_tournament_player_addon(uuid, text, integer) to authenticated, service_role;
