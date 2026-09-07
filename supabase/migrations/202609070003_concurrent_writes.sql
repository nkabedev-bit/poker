-- Три места, где два одновременных действия затирали друг друга.
--
-- Каждое из них раньше читало значение одним запросом и записывало другим. Между
-- чтением и записью успевает вклиниться второй админ, второй игрок или повторная
-- отправка формы — и работа первого пропадает молча.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

-- 1. Отметка «оплатил» после турнира.
--
-- Когда зал уже пуст, стойка считается с копией ростера в data->'settling'. Роут читал
-- эту копию целиком, менял в ней одного игрока и писал обратно весь объект: две отметки
-- подряд — и вторая записывала копию, снятую до первой. Игрок, отмеченный оплатившим,
-- снова становился должником. Патч делается здесь, под тем же локом строки, что и
-- set_player_paid для живого турнира.
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
      item := item || jsonb_build_object('paid', coalesce(p_paid, false));
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

grant execute on function public.set_settling_player_paid(uuid, text, boolean)
  to authenticated, service_role;

-- 2. Проходки.
--
-- Пять мест выдавали и списывали проходки чтением значения и записью held ± 1. Игрок,
-- выбивший двух соперников с проходкой в каждой руке — или получивший проходку за
-- mystery и тут же выигравший розыгрыш, — получал +1 вместо +2. Проходки это деньги.
-- Один UPDATE, считающий от текущего значения в самой строке, гонку закрывает.
--
-- Возвращает {"before": N, "after": M} — вычитание упирается в ноль, и бот показывает
-- то, что случилось на самом деле, а не то, что просили.
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
declare
  before_value integer;
  after_value integer;
begin
  if p_account_id is null and p_telegram_id is null then
    raise exception 'No account given' using errcode = 'P0002';
  end if;

  if coalesce(p_vip, false) then
    update public.client_bot_users
    set vip_free_entries = greatest(0, coalesce(vip_free_entries, 0) + p_delta)
    where (p_account_id is not null and id = p_account_id)
       or (p_account_id is null and telegram_id = p_telegram_id)
    returning coalesce(vip_free_entries, 0) - p_delta, coalesce(vip_free_entries, 0)
    into before_value, after_value;
  else
    update public.client_bot_users
    set free_entries = greatest(0, coalesce(free_entries, 0) + p_delta)
    where (p_account_id is not null and id = p_account_id)
       or (p_account_id is null and telegram_id = p_telegram_id)
    returning coalesce(free_entries, 0) - p_delta, coalesce(free_entries, 0)
    into before_value, after_value;
  end if;

  if after_value is null then
    return null;
  end if;

  -- greatest(0, ...) мог обрезать вычитание, тогда "before" по разнице считается неверно.
  return jsonb_build_object('before', greatest(0, before_value), 'after', after_value);
end;
$$;

grant execute on function public.adjust_free_entries(boolean, integer, uuid, bigint)
  to authenticated, service_role;

-- 3. Запись на турнир.
--
-- Проверка свободных мест и запись заявки шли двумя отдельными запросами. Два игрока
-- жали «записаться» на последнее место одновременно — оба читали «свободно: 1», оба
-- записывались, и клуб продавал на место больше, чем открыл. Для посадки за стол лок
-- ради ровно этого уже сделан (seat_tournament_player), для заявок его не было.
--
-- Считает и пишет под локом строки афиши. Собственная заявка игрока из подсчёта
-- исключается: тот, кто уже держит билет этого вида, меняет напарника или повторяет
-- выбор — он не должен получать отказ из-за самого себя.
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
  saved public.event_signups%rowtype;
begin
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
      and status in ('signed_up', 'seated', 'reserved');

    seat_limit := case p_ticket_type
      when 'vip' then coalesce(event_row.max_vip_players, 10)
      when 'duo' then coalesce(event_row.max_duo_tickets, 0)
      else event_row.max_players
    end;

    -- Пустой max_players у обычного билета означает, что клуб предел не назвал.
    if seat_limit is not null and taken >= seat_limit then
      raise exception 'Event is full' using errcode = 'P0001';
    end if;
  end if;

  insert into public.event_signups as s (
    event_id, user_id, telegram_id, ticket_type, status, use_pass,
    duo_partner_name, duo_partner_user_id, duo_invite_token, duo_confirmed_at
  )
  values (
    p_event_id, p_user_id, p_telegram_id, p_ticket_type, p_status, coalesce(p_use_pass, 'none'),
    p_duo_partner_name, p_duo_partner_user_id, p_duo_invite_token, p_duo_confirmed_at
  )
  on conflict (event_id, user_id) do update
  set telegram_id = excluded.telegram_id,
      ticket_type = excluded.ticket_type,
      status = excluded.status,
      use_pass = excluded.use_pass,
      duo_partner_name = excluded.duo_partner_name,
      duo_partner_user_id = excluded.duo_partner_user_id,
      duo_invite_token = excluded.duo_invite_token,
      duo_confirmed_at = excluded.duo_confirmed_at
  returning * into saved;

  return to_jsonb(saved);
end;
$$;

grant execute on function public.claim_event_signup(
  uuid, uuid, text, text, bigint, text, text, uuid, text, timestamptz
) to authenticated, service_role;
