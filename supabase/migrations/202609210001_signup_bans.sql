-- Отмены записей: журнал и запрет записываться.
--
-- Две вещи, одна причина. Игроки записываются на игру и отменяют запись в последний
-- момент, из-за чего место простаивает, а лист ожидания остаётся ни с чем.
--
-- 1. Журнал отмен. Считать отмены по текущему статусу заявки нельзя: игрок, который
--    отменил запись и записался снова, возвращает строку в signed_up, и отмена
--    исчезает из истории. Счётчик занижался бы ровно у тех, кто отменяет чаще всех.
--    Поэтому каждая отмена пишется отдельной строкой и больше не меняется.
--
-- 2. Запрет записи до даты. Админ выдаёт его командой /ban, снимает /unban. Запрет
--    закрывает и запись, и лист ожидания — иначе он обходится одним нажатием. Прийти
--    в клуб в порядке живой очереди игрок по-прежнему может: за стойкой его сажают
--    как обычно, эта колонка туда не заглядывает.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

create table if not exists public.signup_cancellations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.client_bot_users(id) on delete cascade,
  event_id uuid references public.tournament_events(id) on delete set null,
  -- Название игры на момент отмены: афишу могут удалить, а история остаётся.
  event_title text not null default '',
  event_starts_at timestamptz,
  cancelled_at timestamptz not null default now()
);

create index if not exists signup_cancellations_user_idx
  on public.signup_cancellations (user_id, cancelled_at desc);

alter table public.client_bot_users
  add column if not exists signup_banned_until timestamptz;

comment on column public.client_bot_users.signup_banned_until is
  'До этого момента игрок не может записываться на игры и вставать в лист ожидания. NULL — запрета нет.';

alter table public.signup_cancellations enable row level security;

-- Читает и пишет только сервер приложения: игроку своя история отмен не показывается,
-- а чужая — тем более.
revoke all on table public.signup_cancellations from anon, authenticated;
grant all on table public.signup_cancellations to service_role;

-- Разовый засев: отмены, которые клуб уже накопил, но нигде не считал. Берутся те
-- заявки, что прямо сейчас лежат отменёнными — большего прошлое не помнит. Повторный
-- запуск ничего не задваивает: строка заводится только там, где её ещё нет.
insert into public.signup_cancellations (user_id, event_id, event_title, event_starts_at, cancelled_at)
select
  s.user_id,
  s.event_id,
  coalesce(e.title, ''),
  e.starts_at,
  s.updated_at
from public.event_signups s
left join public.tournament_events e on e.id = s.event_id
where s.status = 'cancelled'
  and s.user_id is not null
  and not exists (
    select 1
    from public.signup_cancellations c
    where c.user_id = s.user_id
      and c.event_id is not distinct from s.event_id
  );
