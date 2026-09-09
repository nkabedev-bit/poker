-- Очередь, которая двигается по одному.
--
-- Освободившееся место объявлялось всему листу ожидания сразу: выигрывал тот, кто
-- быстрее откроет телефон. Игрок, вставший в очередь первым, проигрывал тому, кто встал
-- третьим и просто оказался у экрана.
--
-- Теперь место держат за первым в очереди, и он один может его занять; молчание —
-- ответ, после которого очередь доходит до следующего. Освободилось два места — держат
-- за двумя первыми.
--
-- Две отметки на строке очереди:
--   waitlist_offer_expires_at — до какого момента место держат (пока не истёк, оно занято);
--   waitlist_offered_at       — когда очередь до игрока доходила в последний раз.
--
-- Порознь потому, что удержание снимается (истекло, игрок записался, вышел), а память
-- о том, что шанс уже был, остаётся: она уводит промолчавшего в хвост очереди, не
-- выбрасывая его из неё. Срок хранится концом, а не началом: длину окна знает
-- приложение, здесь она не повторяется.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.
-- Перед запуском заполнить <APP_URL> и <CRON_SECRET> в блоке pg_cron внизу.
-- <APP_URL> — только домен (https://poker-two-liart.vercel.app), БЕЗ пути страницы.

alter table public.event_signups
  add column if not exists waitlist_offer_expires_at timestamptz,
  add column if not exists waitlist_offered_at timestamptz;

-- Тик крона спрашивает ровно об этом: у кого из стоящих в очереди срок вышел.
create index if not exists event_signups_waitlist_offer_idx
  on public.event_signups (event_id, waitlist_offer_expires_at)
  where status = 'waitlist';

-- Запись на турнир под локом строки афиши (202609070003), с одной поправкой: место,
-- которое клуб держит за очередником, занято так же, как проданный билет. Без этого
-- посторонний игрок занимал бы место, объявленное первому в очереди, — то есть ровно
-- то, ради чего очередь и заведена.
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

-- Тик: pg_cron каждые 5 минут зовёт функцию, а та дёргает Vercel ТОЛЬКО когда есть
-- истёкшее удержание на афише, запись на которую ещё открыта. Пока все очереди молчат
-- или ждут ответа — внешнего вызова нет (лимиты Vercel Hobby).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_expired_waitlist_offers()
returns void
language plpgsql
security definer
as $$
declare
  due_count int;
begin
  select count(*) into due_count
    from public.event_signups s
    join public.tournament_events e on e.id = s.event_id
   where s.status = 'waitlist'
     and s.waitlist_offer_expires_at is not null
     and s.waitlist_offer_expires_at <= now()
     and coalesce(e.late_entry_until, e.starts_at) >= now();

  if due_count > 0 then
    perform net.http_post(
      url := '<APP_URL>/api/cron/waitlist-offers',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET>',
        'Content-Type', 'application/json'
      )
    );
  end if;
end;
$$;

select cron.schedule(
  'waitlist-offers',
  '*/5 * * * *',
  $$ select public.dispatch_expired_waitlist_offers(); $$
);
