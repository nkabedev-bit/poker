-- Живой статус турнира для клиентского мини-приложения.
--
-- Экран в зале читает состояние целиком (get_public_state) вместе со всем ростером: экран
-- один, и лишние килобайты ему ничего не стоят. Телефонов в зале два десятка, и каждый
-- спрашивает то же самое раз в полминуты — ростер в формате jsonb весит килобайт двадцать,
-- так что полный ответ стоил бы сотни мегабайт трафика за вечер на одну только карточку
-- «идёт игра».
--
-- Эта функция считает активных прямо в базе и отдаёт несколько сотен байт. Уровни блайндов
-- за игру не меняются, поэтому они едут только по явному запросу (первая загрузка экрана), а
-- дальше приложение сверяет levelsVersion и перезапрашивает их, только если их правили.
--
-- Игроком вечера считается тот, кому за стойкой выдали порядковый номер: запись на турнир
-- номера не даёт, и не пришедший не должен попадать в счёт «в игре».
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

create or replace function public.get_client_live_state(p_include_levels boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_record public.tournaments%rowtype;
  state_record public.timer_state%rowtype;
  players_data jsonb;
  active_players integer := 0;
  total_players integer := 0;
  levels_json jsonb := null;
  levels_count integer := 0;
  levels_stamp timestamptz;
begin
  select * into tournament_record
  from public.tournaments
  limit 1;

  if tournament_record.id is null then
    return null;
  end if;

  select * into state_record
  from public.timer_state
  where tournament_id = tournament_record.id
  limit 1;

  select coalesce(data->'players', '[]'::jsonb)
  into players_data
  from public.tournament_extras
  where tournament_id = tournament_record.id;

  select
    count(*) filter (where coalesce(item->>'status', '') = 'active'),
    count(*)
  into active_players, total_players
  from jsonb_array_elements(coalesce(players_data, '[]'::jsonb)) as item
  where coalesce(item->>'registrationNumber', '') ~ '^[0-9]+$';

  select count(*), max(updated_at)
  into levels_count, levels_stamp
  from public.blind_levels
  where tournament_id = tournament_record.id;

  if p_include_levels then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', bl.id,
          'levelOrder', bl.level_order,
          'smallBlind', bl.small_blind,
          'bigBlind', bl.big_blind,
          'ante', bl.ante,
          'durationSeconds', bl.duration_seconds,
          'isBreak', bl.is_break,
          'breakDurationSeconds', bl.break_duration_seconds
        )
        order by bl.level_order
      ),
      '[]'::jsonb
    )
    into levels_json
    from public.blind_levels bl
    where bl.tournament_id = tournament_record.id;
  end if;

  return jsonb_build_object(
    'tournamentName', tournament_record.name,
    'status', coalesce(state_record.status, 'not_started'),
    'currentLevelIndex', coalesce(state_record.current_level_index, 0),
    'levelStartedAt', state_record.level_started_at,
    'pausedRemainingSeconds', state_record.paused_remaining_seconds,
    'registrationClosesAt', state_record.registration_closes_at,
    'activePlayers', coalesce(active_players, 0),
    'totalPlayers', coalesce(total_players, 0),
    -- Меняется, когда уровни правили или их стало другое число: приложение по нему
    -- понимает, что сетку блайндов пора перечитать.
    'levelsVersion', coalesce(levels_count, 0)::text || ':' || coalesce(levels_stamp::text, ''),
    'blindLevels', levels_json
  );
end;
$$;

-- Как и остальные серверные функции: зовёт её только сервер приложения ключом service_role.
revoke execute on function public.get_client_live_state(boolean) from public, anon;
grant execute on function public.get_client_live_state(boolean) to service_role;
