-- VIP-билетов больше нет.
--
-- С 19.10.2026 клуб продаёт два билета: обычный и «1+1». VIP-стола, VIP-номеров 21–35,
-- VIP-проходок и VIP-розыгрыша больше нет. Выданные VIP-проходки клуб меняет по курсу
-- «одна VIP — две обычные».
--
-- Что делает миграция:
--   1. Проходки: free_entries += 2 × vip_free_entries, VIP-счётчик обнуляется.
--   2. Записи на игры, которые ещё впереди: VIP-билет и VIP-проходка становятся обычными.
--   3. Афиши, которые ещё впереди, и шаблоны афиш: VIP-места прибавляются к обычным,
--      VIP-цена снимается.
--   4. Функции больше не знают VIP: номера на вечер выдаются 1–40 подряд, запись считает
--      только обычные места и «1+1», карта не пишет тип билета, розыгрыш — один за турнир.
--
-- Совместима с кодом, который ещё знает VIP, поэтому накатывается до деплоя:
--   - adjust_free_entries(p_vip, …) остаётся и VIP-проходку зачисляет двумя обычными —
--     по тому же курсу; новый код зовёт перегрузку без p_vip;
--   - assign_player_card принимает p_ticket_type, но больше его не пишет;
--   - колонки vip_* остаются пустыми — старый код их читает. Снять их можно отдельной
--     миграцией после деплоя.
--
-- Повторный запуск безопасен: обмен идёт только по ненулевому VIP-счётчику.
--
-- Зеркала: lib/player-registration-number.ts, lib/tournament-player-registration.ts,
-- lib/free-entries/holds.ts.

-- 1. Обмен проходок.
update public.client_bot_users
set free_entries = coalesce(free_entries, 0) + 2 * vip_free_entries,
    vip_free_entries = 0
where vip_free_entries > 0;

-- 2. Записи на игры, которые ещё не прошли. «Ещё не прошла» — то же правило, что у брони
-- проходки: турнир впереди, сегодняшний вечер по Москве или до шести часов после старта.
with upcoming as (
  select id
  from public.tournament_events e
  where coalesce(e.late_entry_until, e.starts_at) >= now()
    or (e.starts_at at time zone 'Europe/Moscow')::date
      = (now() at time zone 'Europe/Moscow')::date
    or (now() >= e.starts_at and now() < e.starts_at + interval '6 hours')
)
update public.event_signups s
set ticket_type = case when s.ticket_type = 'vip' then 'regular' else s.ticket_type end,
    use_pass = case when s.use_pass = 'vip' then 'regular' else s.use_pass end
where s.event_id in (select id from upcoming)
  and (s.ticket_type = 'vip' or s.use_pass = 'vip');

-- 3. Афиши, которые ещё не прошли: VIP-стол становится обычными местами. Пустой
-- max_players значит «без предела» — к нему прибавлять нечего.
update public.tournament_events e
set max_players = case
      when e.max_players is not null and coalesce(e.max_vip_players, 0) > 0
        then e.max_players + e.max_vip_players
      else e.max_players
    end,
    max_vip_players = null,
    vip_buy_in = null
where (e.max_vip_players is not null or e.vip_buy_in is not null)
  and (
    coalesce(e.late_entry_until, e.starts_at) >= now()
    or (e.starts_at at time zone 'Europe/Moscow')::date
      = (now() at time zone 'Europe/Moscow')::date
    or (now() >= e.starts_at and now() < e.starts_at + interval '6 hours')
  );

-- Шаблоны афиш лежат в настройках турнира. Ключи остаются (ноль и null) — старый код
-- их читает; новый не смотрит.
update public.tournament_extras x
set data = jsonb_set(
  x.data,
  '{eventTemplates}',
  (
    select coalesce(jsonb_agg(
      case
        when jsonb_typeof(t->'maxVipPlayers') = 'number' and (t->>'maxVipPlayers')::numeric > 0
          then t || jsonb_build_object(
            'maxPlayers',
              case
                when jsonb_typeof(t->'maxPlayers') = 'number'
                  then to_jsonb((t->>'maxPlayers')::numeric + (t->>'maxVipPlayers')::numeric)
                else t->'maxPlayers'
              end,
            'maxVipPlayers', 0,
            'vipBuyIn', null
          )
        when t ? 'vipBuyIn' and t->'vipBuyIn' <> 'null'::jsonb
          then t || jsonb_build_object('vipBuyIn', null)
        else t
      end
      order by ord
    ), '[]'::jsonb)
    from jsonb_array_elements(x.data->'eventTemplates') with ordinality as items(t, ord)
  )
)
where jsonb_typeof(x.data->'eventTemplates') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(x.data->'eventTemplates') as t
    where (jsonb_typeof(t->'maxVipPlayers') = 'number' and (t->>'maxVipPlayers')::numeric > 0)
      or (t ? 'vipBuyIn' and t->'vipBuyIn' <> 'null'::jsonb)
  );

-- 4a. Выдача и списание проходок — одна колонка.
create or replace function public.adjust_free_entries(
  p_delta integer,
  p_account_id uuid default null,
  p_telegram_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  before_value integer;
  after_value integer;
begin
  if p_account_id is null and p_telegram_id is null then
    raise exception 'No account given' using errcode = 'P0002';
  end if;

  update public.client_bot_users
  set free_entries = greatest(0, coalesce(free_entries, 0) + p_delta)
  where (p_account_id is not null and id = p_account_id)
     or (p_account_id is null and telegram_id = p_telegram_id)
  returning coalesce(free_entries, 0) - p_delta, coalesce(free_entries, 0)
  into before_value, after_value;

  if after_value is null then
    return null;
  end if;

  -- greatest(0, ...) мог обрезать вычитание, тогда "before" по разнице считается неверно.
  return jsonb_build_object('before', greatest(0, before_value), 'after', after_value);
end;
$$;

revoke all on function public.adjust_free_entries(integer, uuid, bigint) from public, anon;
grant execute on function public.adjust_free_entries(integer, uuid, bigint)
  to authenticated, service_role;

-- Старая перегрузка — для кода, который ещё не задеплоен. VIP-проходка от него приходит
-- двумя обычными, и снимается так же: по курсу обмена.
create or replace function public.adjust_free_entries(
  p_vip boolean,
  p_delta integer,
  p_account_id uuid default null,
  p_telegram_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.adjust_free_entries(
    p_delta * case when coalesce(p_vip, false) then 2 else 1 end,
    p_account_id,
    p_telegram_id
  );
end;
$$;

revoke all on function public.adjust_free_entries(boolean, integer, uuid, bigint) from public, anon;
grant execute on function public.adjust_free_entries(boolean, integer, uuid, bigint)
  to authenticated, service_role;

-- 4b. Запись на турнир: обычные места и «1+1», проходка одного вида.
create or replace function public.claim_event_signup(
  p_event_id uuid,
  p_user_id uuid,
  p_ticket_type text,
  p_status text,
  p_telegram_id bigint default null,
  p_use_pass text default 'none',
  p_duo_partner_name text default null,
  p_duo_partner_user_id uuid default null,
  p_duo_invite_token text default null,
  p_duo_confirmed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.tournament_events%rowtype;
  taken integer;
  seat_limit integer;
  passes_on_account integer;
  passes_promised integer;
  saved public.event_signups%rowtype;
begin
  if p_ticket_type not in ('regular', 'duo', 'duo_plus_one') then
    raise exception 'Unknown ticket type: %', p_ticket_type using errcode = 'P0001';
  end if;

  if coalesce(p_use_pass, 'none') not in ('none', 'regular') then
    raise exception 'Unknown free pass: %', p_use_pass using errcode = 'P0001';
  end if;

  select * into event_row
  from public.tournament_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  -- Место в очереди комнату не занимает, и второй половине пары своего места не нужно:
  -- оно продано вместе с билетом, который уже держит хозяин.
  if p_status <> 'waitlist' and p_ticket_type <> 'duo_plus_one' then
    select count(*) into taken
    from public.event_signups
    where event_id = p_event_id
      and user_id <> p_user_id
      and ticket_type = p_ticket_type
      and (
        status in ('signed_up', 'seated', 'reserved')
        -- Место держат за очередником, пока не истёк его срок ответа. Своё удержание
        -- игроку не мешает: строка сравнением по user_id из подсчёта уже исключена.
        or (status = 'waitlist' and waitlist_offer_expires_at > now())
      );

    seat_limit := case p_ticket_type
      when 'duo' then coalesce(event_row.max_duo_tickets, 0)
      else event_row.max_players
    end;

    -- Пустой max_players у обычного билета означает, что клуб предел не назвал.
    if seat_limit is not null and taken >= seat_limit then
      raise exception 'Event is full' using errcode = 'P0001';
    end if;
  end if;

  -- Проходка, отмеченная на другой игре, которая ещё впереди, уже занята. Строка игрока
  -- блокируется, чтобы две одновременные записи не насчитали одну проходку дважды.
  if coalesce(p_use_pass, 'none') = 'regular' and p_status in ('signed_up', 'reserved') then
    select free_entries
    into passes_on_account
    from public.client_bot_users
    where id = p_user_id
    for update;

    select count(*) into passes_promised
    from public.event_signups s
    join public.tournament_events e on e.id = s.event_id
    where s.user_id = p_user_id
      and s.event_id <> p_event_id
      and s.use_pass = 'regular'
      and s.status in ('signed_up', 'reserved')
      and (
        -- Турнир впереди, пока не закрылась поздняя регистрация.
        coalesce(e.late_entry_until, e.starts_at) >= now()
        -- Или это сегодняшний вечер по Москве...
        or (e.starts_at at time zone 'Europe/Moscow')::date
          = (now() at time zone 'Europe/Moscow')::date
        -- ...и ещё шесть часов после начала, когда вечер перевалил за полночь.
        or (now() >= e.starts_at and now() < e.starts_at + interval '6 hours')
      );

    if coalesce(passes_on_account, 0) <= passes_promised then
      raise exception 'Free pass already held' using errcode = 'P0001';
    end if;
  end if;

  insert into public.event_signups as s (
    event_id, user_id, telegram_id, ticket_type, status, use_pass,
    duo_partner_name, duo_partner_user_id, duo_invite_token, duo_confirmed_at,
    waitlist_offer_expires_at, waitlist_offered_at
  )
  values (
    p_event_id, p_user_id, p_telegram_id, p_ticket_type, p_status, coalesce(p_use_pass, 'none'),
    p_duo_partner_name, p_duo_partner_user_id, p_duo_invite_token, p_duo_confirmed_at,
    null, null
  )
  on conflict (event_id, user_id) do update
  set telegram_id = excluded.telegram_id,
      ticket_type = excluded.ticket_type,
      status = excluded.status,
      use_pass = excluded.use_pass,
      duo_partner_name = excluded.duo_partner_name,
      duo_partner_user_id = excluded.duo_partner_user_id,
      duo_invite_token = excluded.duo_invite_token,
      duo_confirmed_at = excluded.duo_confirmed_at,
      -- Заявка написана — очередь для этого игрока кончилась: ни удержания, ни памяти
      -- о нём. Встанет в очередь снова — начнёт с чистого места в ней.
      waitlist_offer_expires_at = null,
      waitlist_offered_at = null
  returning * into saved;

  return to_jsonb(saved);
end;
$$;

revoke all on function public.claim_event_signup(
  uuid, uuid, text, text, bigint, text, text, uuid, text, timestamptz
) from public, anon;
grant execute on function public.claim_event_signup(
  uuid, uuid, text, text, bigint, text, text, uuid, text, timestamptz
) to authenticated, service_role;

-- 4c. Номер на вечер: 1–40 подряд, и не больше сорока игроков за вечер.
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
  -- The evening holds forty numbers and so forty players at most, busted ones included,
  -- however many tables are set up. The table parameters stay in the signature for
  -- callers already deployed; the chairs themselves are counted by the app.
  max_number := 40;
  registered_count := jsonb_array_length(players_data);

  if registered_count >= max_number then
    raise exception 'Tournament capacity reached: % players registered', registered_count
      using errcode = 'P0001';
  end if;

  -- Every number spoken for tonight: the ones players are called by, and the ones they
  -- were called by before.
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

  for next_number in 1..max_number loop
    if not next_number = any(used_numbers) then
      candidate := next_number;
      exit;
    end if;
  end loop;

  if candidate is null then
    raise exception 'Registration numbers exhausted' using errcode = 'P0001';
  end if;

  -- Билета у игрока больше нет: обычный один на всех. Старый код ещё присылает тип
  -- билета и категорию — их не храним.
  next_player := (p_player - 'ticketType' - 'category')
    || jsonb_build_object(
      'registrationNumber', candidate,
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

-- 4d. Карта игрока: только код. Тип билета старый код ещё присылает — не храним.
create or replace function public.assign_player_card(
  p_tournament_id uuid,
  p_player_id text,
  p_card_code text,
  p_ticket_type text default null
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
  assigned jsonb := null;
  holder text := null;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament extras not found' using errcode = 'P0002';
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  -- The same card cannot be out with two players at once.
  for item in select * from jsonb_array_elements(players_list) loop
    if coalesce(item->>'cardCode', '') = p_card_code and item->>'id' <> p_player_id then
      holder := coalesce(item->>'name', 'другой игрок');
    end if;
  end loop;

  if holder is not null then
    raise exception 'Card already issued to %', holder using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' = p_player_id then
      item := (item - 'ticketType') || jsonb_build_object('cardCode', p_card_code);
      assigned := item;
    end if;

    updated_players := updated_players || item;
  end loop;

  if assigned is null then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return assigned;
end;
$$;

revoke all on function public.assign_player_card(uuid, text, text, text) from public, anon;
grant execute on function public.assign_player_card(uuid, text, text, text)
  to authenticated, service_role;

-- 4e. Розыгрыш: один за турнир. VIP-розыгрыша больше нет, и у записи нет вида — второй
-- розыгрыш отклоняется, какого бы вида он ни был.
create or replace function public.set_tournament_raffle(
  p_tournament_id uuid,
  p_raffle jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  next_data jsonb;
  history jsonb;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament extras not found' using errcode = 'P0002';
  end if;

  if p_raffle is null or p_raffle = 'null'::jsonb then
    -- Closing the window leaves the history alone: the draw still happened.
    next_data := extras_row.data - 'raffle';
  else
    history := coalesce(extras_row.data->'raffleHistory', '[]'::jsonb);

    -- A different draw is refused; the same one may be written again, which is how the
    -- prize is recorded once it has actually been paid in.
    if exists (
      select 1
      from jsonb_array_elements(history) as item
      where item->>'id' <> p_raffle->>'id'
    ) then
      raise exception 'Raffle already held' using errcode = 'P0001';
    end if;

    next_data := extras_row.data
      || jsonb_build_object('raffle', p_raffle, 'raffleHistory', jsonb_build_array(p_raffle));
  end if;

  update public.tournament_extras
  set data = next_data
  where tournament_id = p_tournament_id;

  return coalesce(next_data->'raffle', 'null'::jsonb);
end;
$$;

revoke all on function public.set_tournament_raffle(uuid, jsonb) from public, anon;
grant execute on function public.set_tournament_raffle(uuid, jsonb) to authenticated, service_role;

-- Победы прошлых VIP-розыгрышей остаются в истории как есть; новые пишутся без вида.
alter table public.raffle_winners alter column kind set default 'regular';

-- PostgREST должен увидеть новую перегрузку adjust_free_entries и умолчание у карты.
notify pgrst, 'reload schema';
