-- Одна проходка — одна запись.
--
-- Проходка списывается у двери, при посадке, а запись только отмечает, чем игрок будет
-- платить. Ничто не мешало отметить единственную проходку сразу на трёх турнирах: у двери
-- её хватило бы на первый, а на остальных игроку пришлось бы платить.
--
-- Теперь запись с проходкой её бронирует: пока турнир ещё впереди (или идёт сегодня), та же
-- проходка на другую игру не записывается. Отменил запись, отдали место как неявке, вечер
-- прошёл без игрока — бронь снимается сама, возвращать нечего.
--
-- Проверка — внутри claim_event_signup, под блокировкой строки игрока: две записи,
-- отправленные одновременно, не займут одну проходку дважды. Приложение считает брони так
-- же (lib/free-entries/holds.ts) — правила держать в согласии.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

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
      when 'vip' then coalesce(event_row.max_vip_players, 10)
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
  if coalesce(p_use_pass, 'none') in ('regular', 'vip') and p_status in ('signed_up', 'reserved') then
    select case when p_use_pass = 'vip' then vip_free_entries else free_entries end
    into passes_on_account
    from public.client_bot_users
    where id = p_user_id
    for update;

    select count(*) into passes_promised
    from public.event_signups s
    join public.tournament_events e on e.id = s.event_id
    where s.user_id = p_user_id
      and s.event_id <> p_event_id
      and s.use_pass = p_use_pass
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

grant execute on function public.claim_event_signup(
  uuid, uuid, text, text, bigint, text, text, uuid, text, timestamptz
) to authenticated, service_role;
