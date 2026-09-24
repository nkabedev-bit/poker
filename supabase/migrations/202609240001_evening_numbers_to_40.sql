-- Вечер на сорок человек.
--
-- Номер игрока выдаётся на весь вечер и после вылета не освобождается: вылетевший
-- остаётся в розыгрыше и в листе клуба, и звать двоих одним номером хуже, чем пропустить
-- номер. Обычных номеров было двадцать (1–20), VIP — всё, что выше, а сам ростер
-- упирался в «столы × 10», то есть в тридцать человек за вечер при трёх столах.
--
-- Клуб сажает не больше 27 человек за раз, но вылетевших сменяют опоздавшие и лист
-- ожидания, и за вечер через столы проходит больше тридцати. Теперь:
--   обычные номера — 1–20, а когда они кончатся — 36–40;
--   VIP — 21–35;
--   за вечер не больше сорока игроков — ровно столько номеров, сколько есть.
--
-- Меняется только выдача номера и потолок ростера; сдвиг мест опоздавшим (202609170001)
-- остаётся как был.
--
-- Зеркала: lib/player-registration-number.ts, lib/tournament-player-registration.ts.

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
  roster_item jsonb;
  finish_place integer;
  has_places boolean := false;
  has_winner boolean := false;
  shifted_players jsonb := '[]'::jsonb;
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
  -- The evening holds forty numbers — 1–20 and 36–40 regular, 21–35 VIP — and so forty
  -- players at most, busted ones included, however many tables are set up. The table
  -- parameters stay in the signature for callers already deployed; the chairs themselves
  -- are counted by the app.
  max_number := 40;
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

  candidate := null;

  if takes_vip_number then
    -- VIP: 21–35.
    for vip_number in 21..35 loop
      if not vip_number = any(used_numbers) then
        candidate := vip_number;
        exit;
      end if;
    end loop;

    if candidate is null then
      raise exception 'VIP registration numbers exhausted' using errcode = 'P0001';
    end if;
  else
    -- Regular: 1–20, and 36–40 once those are gone.
    for regular_number in 1..20 loop
      if not regular_number = any(used_numbers) then
        candidate := regular_number;
        exit;
      end if;
    end loop;

    if candidate is null then
      for regular_number in 36..40 loop
        if not regular_number = any(used_numbers) then
          candidate := regular_number;
          exit;
        end if;
      end loop;
    end if;

    if candidate is null then
      raise exception 'Regular registration numbers exhausted' using errcode = 'P0001';
    end if;
  end if;

  next_player := p_player
    || jsonb_build_object(
      'registrationNumber', candidate,
      'category', case when candidate between 21 and 35 then 'VIP' else 'Normal' end,
      'table', p_table_number
    );

  -- Опоздавший раздвигает уже выданные места: каждого, кто вылетел до него, обошли на
  -- одного игрока больше. Без сдвига следующий вылет метит в занятое место, и запись
  -- вылета уводит игрока в первый свободный слот — на самое дно таблицы.
  --
  -- Первое место означает конец турнира: дописывать игроков туда уже нечего, и трогать
  -- победителя нельзя.
  for roster_item in select * from jsonb_array_elements(players_data) loop
    if (roster_item->>'finishPlace') ~ '^[0-9]+$' then
      finish_place := (roster_item->>'finishPlace')::integer;
      if finish_place = 1 then has_winner := true; end if;
      if finish_place > 0 then has_places := true; end if;
    end if;
  end loop;

  if has_places and not has_winner then
    for roster_item in select * from jsonb_array_elements(players_data) loop
      if (roster_item->>'finishPlace') ~ '^[0-9]+$'
         and (roster_item->>'finishPlace')::integer > 0 then
        roster_item := roster_item || jsonb_build_object(
          'finishPlace', (roster_item->>'finishPlace')::integer + 1
        );
      end if;

      shifted_players := shifted_players || roster_item;
    end loop;

    players_data := shifted_players;
  end if;

  update public.tournament_extras
  set data = extras_data || jsonb_build_object('players', players_data || jsonb_build_array(next_player))
  where tournament_id = p_tournament_id;

  return next_player;
end;
$$;

revoke all on function public.append_tournament_player(uuid, jsonb, integer, integer, integer) from public, anon;
grant execute on function public.append_tournament_player(uuid, jsonb, integer, integer, integer) to authenticated, service_role;
