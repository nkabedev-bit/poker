-- Объявления клуба на главной мини-аппа.
--
-- Карусель карточек «Объявление клуба» над афишами. Админ ведёт её в TMA, в разделе
-- «Рассылка и бот»: текст, необязательная ссылка, куда ведёт карточка, и необязательный
-- срок показа. Лента рассылок (club_announcements) — другая вещь: там копии того, что
-- бот уже разослал, здесь — то, что висит на главной, пока админ его не уберёт.
--
-- Порядок карточек — колонка position, её целиком переписывает сохранение списка в TMA.
-- Срок показа — show_until: с этого момента карточку не видно, строка остаётся, пока
-- её не удалят. NULL — без срока.
--
-- Отдельная таблица, а не tournament_extras: туда во время игры пишут функции мистери
-- и оплат, а сохранение всей строки из TMA могло бы затереть их записи.
--
-- Пока миграция не применена, главная показывает карусель без этих карточек, а
-- сохранение в TMA отвечает, что объявления ещё не включены.
--
-- Применять вручную. Повторный запуск безопасен.

create table if not exists public.club_home_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null
    constraint club_home_announcements_message_length
      check (char_length(message) between 1 and 500),
  -- Только http(s): адрес уходит в href и в Telegram.openLink.
  link_url text
    constraint club_home_announcements_link_scheme
      check (link_url is null or (link_url ~* '^https?://' and char_length(link_url) <= 500)),
  show_until timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_home_announcements_position_idx
  on public.club_home_announcements (position, created_at);

alter table public.club_home_announcements enable row level security;

-- Читает и пишет только сервер приложения: игроки получают карточки в ответе главной.
revoke all on table public.club_home_announcements from anon, authenticated;
grant all on table public.club_home_announcements to service_role;

-- Карточка про чемпионат в Сочи жила в коде с концом показа 20 ноября. Переезжает сюда
-- с тем же сроком. Только в пустую таблицу: если админ её уже удалил, повторный запуск
-- её не вернёт.
insert into public.club_home_announcements (message, link_url, show_until, position)
select
  'Majestic едет в Сочи, нажмите для подробностей!',
  'https://t.me/majesticpokerptz/1197',
  '2026-11-20 00:00:00+03'::timestamptz,
  0
where not exists (select 1 from public.club_home_announcements);
