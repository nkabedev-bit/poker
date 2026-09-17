-- Поздняя регистрация ломала места вылетевших.
--
-- Место за вылет — это число игроков, ещё стоявших за столами: пока ростер не растёт,
-- лестница идёт вниз без пропусков (24, 23, 22…). Игрок, пришедший после того, как
-- кто-то уже вылетел, добавляет в вечер человека, которого те вылеты не считали, — и
-- счётчик активных возвращается к значению, которое кто-то уже занял. record_player_
-- elimination в этом случае ищет первое свободное место ВВЕРХ и находит единственное
-- оставшееся — самое дно таблицы.
--
-- Так было 15.09.2026: 24 игрока, восемь вылетов (места 24…17), затем за стол сел
-- опоздавший, и следующая вылетевшая (Vera) получила 25-е место вместо 17-го, а с ним
-- 5 очков вместо 45.
--
-- Лечится в точке, где растёт ростер: опоздавший сдвигает все уже выданные места на
-- шаг вниз (17 → 18, 24 → 25), лестница снова целая, и поиск свободного места сверху
-- больше ни во что не упирается. Победителя это не касается — первое место выдаётся
-- только вместе с концом турнира.
--
-- Отмена вылета шла из журнала, где записано место на момент вылета. После сдвига этот
-- снимок указывает на чужую ступень, поэтому cancel_player_elimination теперь читает
-- место с самого игрока, а журнал оставляет запасным вариантом (ре-энтри места не
-- занимает, и на игроке его нет).
--
-- Зеркала: lib/tournament-player-registration.ts, lib/tma/elimination-rollback.ts.

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

revoke all on function public.append_tournament_player(uuid, jsonb, integer, integer, integer) from public;
grant execute on function public.append_tournament_player(uuid, jsonb, integer, integer, integer) to authenticated, service_role;

create or replace function public.cancel_player_elimination(
  p_tournament_id uuid,
  p_eliminated_id text,
  p_finish_place integer,
  p_killers jsonb,
  p_mystery_points numeric,
  p_uses_reentry boolean,
  p_players_before jsonb,
  p_reentry_double boolean default false,
  p_progressive boolean default false,
  p_victim_progressive numeric default 0
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
  pid text;
  bounty_share numeric;
  bounty_chips numeric;
  mystery_share numeric;
  restored_finish_place integer;
  new_count integer;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return '[]'::jsonb;
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  -- Место, которое освобождается, — то, что стоит на игроке сейчас, а не то, что записал
  -- журнал час назад: поздняя регистрация сдвигает всю лестницу мест вниз, и снимок из
  -- журнала после неё указывает на чужую ступень. Журнал остаётся запасным вариантом —
  -- ре-энтри места не занимает, и на игроке его нет.
  select (roster_item->>'finishPlace')::integer
  into restored_finish_place
  from jsonb_array_elements(players_list) as roster_item
  where roster_item->>'id' = p_eliminated_id
    and (roster_item->>'finishPlace') ~ '^[0-9]+$'
    and (roster_item->>'finishPlace')::integer > 0
  limit 1;

  restored_finish_place := coalesce(restored_finish_place, p_finish_place);

  if p_players_before is not null and jsonb_typeof(p_players_before) = 'array' then
    updated_players := p_players_before;
    for item in select * from jsonb_array_elements(players_list) loop
      select count(*) into new_count
      from jsonb_array_elements(p_players_before) as pb
      where pb->>'id' = item->>'id';

      if new_count = 0 then
        updated_players := updated_players || item;
      end if;
    end loop;
  else
    for item in select * from jsonb_array_elements(players_list) loop
      pid := item->>'id';

      if pid = p_eliminated_id then
        if p_uses_reentry then
          item := item || jsonb_build_object(
            'rebuys', greatest(0, coalesce((item->>'rebuys')::integer, 0) - 1)
          );
          if p_reentry_double then
            item := item || jsonb_build_object(
              'doubleRebuys', greatest(0, coalesce((item->>'doubleRebuys')::integer, 0) - 1)
            );
          end if;
          -- Progressive Bounty: the re-entry zeroed the head cycle, so undoing the
          -- knockout puts back the counter the snapshot held before it.
          if p_progressive then
            item := item || jsonb_build_object(
              'progressiveKnockouts', round(greatest(0, coalesce(p_victim_progressive, 0)), 6)
            );
          end if;
        else
          item := item || jsonb_build_object(
            'finishPlace', null,
            'status', 'active'
          );
        end if;
      end if;

      if not p_uses_reentry and restored_finish_place is not null and restored_finish_place > 0 then
        if coalesce(item->>'status', '') = 'eliminated'
           and item->>'finishPlace' is not null
           and (item->>'finishPlace')::integer > 0
           and (item->>'finishPlace')::integer < restored_finish_place then
          item := item || jsonb_build_object(
            'finishPlace', (item->>'finishPlace')::integer + 1
          );
        end if;
      end if;

      if not p_uses_reentry and restored_finish_place = 2 then
        if coalesce((item->>'finishPlace')::integer, 0) = 1 then
          item := item || jsonb_build_object('finishPlace', null);
        end if;
      end if;

      bounty_share := 0;
      bounty_chips := 0;
      mystery_share := 0;

      if p_killers is not null and jsonb_typeof(p_killers) = 'array' then
        select
          coalesce(sum((k->>'share')::numeric), 0),
          coalesce(sum(coalesce((k->>'bountyChips')::numeric, 0)), 0),
          coalesce(sum((k->>'share')::numeric * coalesce(p_mystery_points, 0)), 0)
        into bounty_share, bounty_chips, mystery_share
        from jsonb_array_elements(p_killers) as k
        where k->>'id' = pid;
      end if;

      if bounty_share > 0 then
        item := item || jsonb_build_object(
          'bountyChipsTotal', greatest(0, round(coalesce((item->>'bountyChipsTotal')::numeric, 0) - bounty_chips, 6)),
          'bountyCount', greatest(0, round(coalesce((item->>'bountyCount')::numeric, 0) - bounty_share, 6)),
          'stack', greatest(0, round(coalesce((item->>'stack')::numeric, 0) - bounty_chips, 6))
        );
      end if;

      if mystery_share > 0 then
        item := item || jsonb_build_object(
          'mysteryBountyPoints', greatest(0, round(coalesce((item->>'mysteryBountyPoints')::numeric, 0) - mystery_share, 2))
        );
      end if;

      if p_progressive and bounty_share > 0 then
        item := item || jsonb_build_object(
          'progressiveKnockouts', greatest(0, round(coalesce((item->>'progressiveKnockouts')::numeric, 0) - bounty_share, 6))
        );
      end if;

      updated_players := updated_players || item;
    end loop;
  end if;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated_players;
end;
$$;

revoke all on function public.cancel_player_elimination(uuid, text, integer, jsonb, numeric, boolean, jsonb, boolean, boolean, numeric) from public;
grant execute on function public.cancel_player_elimination(uuid, text, integer, jsonb, numeric, boolean, jsonb, boolean, boolean, numeric) to authenticated, service_role;
