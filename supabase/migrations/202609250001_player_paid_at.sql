-- Когда игрок оплатил.
--
-- Стойка работает со списком «Выданные карты» весь вечер, и оплатившие в нём стояли по
-- номеру: отмеченный только что игрок уезжал в середину зелёного блока, и админ терял,
-- кого сейчас отметил. Теперь рядом с флагом `paid` лежит `paidAt` — время отметки, и
-- список ставит последнюю оплату первой.
--
-- Время пишется здесь, под тем же локом строки, что и сам флаг: одна запись, без гонки
-- со вторым админом. Формат — как у JavaScript toISOString (UTC, миллисекунды), чтобы
-- приложение читало его без сюрпризов. Снятая отметка время стирает, повторная пишет
-- новое.
--
-- Сигнатуры не меняются: роуты зовут функции как раньше. До применения миграции у
-- оплативших просто нет времени, и они стоят по номеру, как стояли.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

-- 1. Живой турнир: игроки в data->'players'.
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
      item := item || jsonb_build_object(
        'paid', coalesce(p_paid, false),
        'paidAt', case
          when coalesce(p_paid, false)
            then to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          else 'null'::jsonb
        end
      );
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

revoke all on function public.set_player_paid(uuid, text, boolean) from public, anon;
grant execute on function public.set_player_paid(uuid, text, boolean) to authenticated, service_role;

-- 2. После турнира: стойка считается с копией ростера в data->'settling'.
create or replace function public.set_settling_player_paid(
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
  settling_data jsonb;
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

  settling_data := extras_row.data->'settling';

  if settling_data is null or jsonb_typeof(settling_data) <> 'object' then
    raise exception 'Settling copy not found' using errcode = 'P0002';
  end if;

  players_list := coalesce(settling_data->'players', '[]'::jsonb);

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' = p_player_id then
      item := item || jsonb_build_object(
        'paid', coalesce(p_paid, false),
        'paidAt', case
          when coalesce(p_paid, false)
            then to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          else 'null'::jsonb
        end
      );
      updated := item;
    end if;

    updated_players := updated_players || item;
  end loop;

  if updated is null then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object(
    'settling',
    settling_data || jsonb_build_object('players', updated_players)
  )
  where tournament_id = p_tournament_id;

  return updated;
end;
$$;

revoke all on function public.set_settling_player_paid(uuid, text, boolean) from public, anon;
grant execute on function public.set_settling_player_paid(uuid, text, boolean)
  to authenticated, service_role;
