-- Расформирование стола одним действием.
--
-- Админ жмёт «Объединение столов» и выбирает стол. Приложение раскладывает игроков
-- этого стола по остальным играющим столам — поровну, места случайные — и присылает
-- сюда готовый список пересадок вместе с объявлением для экрана в зале.
--
-- Функция делает всё под одной блокировкой ростера, как `seat_tournament_player` для
-- одного игрока: пересаживает всех и записывает объявление (`data.tableMerge`) со
-- списком «кто за какой стол». Если за время раскладки рассадка изменилась — игрок
-- вылетел, кого-то посадили на выбранное место или за разбираемый стол, — не меняется
-- ничего, и приложение просит попробовать ещё раз. Наполовину пересаженного стола не
-- бывает.
--
-- Без этой миграции расформирование отвечает ошибкой, а «Только пауза» работает как
-- раньше. Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

create or replace function public.break_tournament_table(
  p_tournament_id uuid,
  p_table integer,
  p_moves jsonb,
  p_table_merge jsonb
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
  move jsonb;
  mover_ids text[];
  holder text;
begin
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) = 0 then
    raise exception 'No moves to make' using errcode = '22023';
  end if;

  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament extras not found' using errcode = 'P0002';
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  select array_agg(m->>'id') into mover_ids
  from jsonb_array_elements(p_moves) as m;

  if exists (
    select 1
    from jsonb_array_elements(p_moves) as m
    group by m->>'table', m->>'seat'
    having count(*) > 1
  ) then
    raise exception 'Two players sent to one seat' using errcode = 'P0001';
  end if;

  for move in select * from jsonb_array_elements(p_moves) loop
    if coalesce((move->>'table')::integer, 0) < 1
      or coalesce((move->>'seat')::integer, 0) < 1
      or (move->>'table')::integer = p_table
    then
      raise exception 'Nowhere to send player %', move->>'id' using errcode = '22023';
    end if;

    -- The player must still be playing at the table being broken.
    if not exists (
      select 1
      from jsonb_array_elements(players_list) as p
      where p->>'id' = move->>'id'
        and coalesce(p->>'status', '') = 'active'
        and coalesce((p->>'table')::integer, 0) = p_table
    ) then
      raise exception 'Player is no longer at the table: %', move->>'id' using errcode = 'P0001';
    end if;

    -- And the chair has to be empty: nobody staying where they are is sitting in it.
    holder := null;
    select coalesce(p->>'name', 'другой игрок') into holder
    from jsonb_array_elements(players_list) as p
    where coalesce(p->>'status', '') = 'active'
      and not ((p->>'id') = any(mover_ids))
      and coalesce((p->>'table')::integer, 0) = (move->>'table')::integer
      and coalesce((p->>'seat')::integer, 0) = (move->>'seat')::integer
    limit 1;

    if holder is not null then
      raise exception 'Seat already taken by %', holder using errcode = 'P0001';
    end if;
  end loop;

  -- Everybody at the table goes: one left behind would be sitting at a table that is gone.
  if exists (
    select 1
    from jsonb_array_elements(players_list) as p
    where coalesce(p->>'status', '') = 'active'
      and coalesce((p->>'table')::integer, 0) = p_table
      and not ((p->>'id') = any(mover_ids))
  ) then
    raise exception 'Somebody else is still at the table' using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(players_list) loop
    move := null;
    select m into move
    from jsonb_array_elements(p_moves) as m
    where m->>'id' = item->>'id'
    limit 1;

    if move is not null then
      item := item || jsonb_build_object(
        'table', (move->>'table')::integer,
        'seat', (move->>'seat')::integer
      );
    end if;

    updated_players := updated_players || item;
  end loop;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object(
    'players', updated_players,
    'tableMerge', p_table_merge
  )
  where tournament_id = p_tournament_id;

  return p_table_merge;
end;
$$;

revoke all on function public.break_tournament_table(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.break_tournament_table(uuid, integer, jsonb, jsonb) to service_role;
