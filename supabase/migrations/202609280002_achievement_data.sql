-- Данные для новых достижений.
--
-- 1. Очерёдность посадки. «Раньше блайндов» — три раза сесть за стол первым в вечер. Кто
--    сел первым, раньше нигде не хранилось, поэтому на финише приложение теперь пишет в
--    результат, каким по счёту игрок сел в тот вечер (1 — первый). Старые игры остаются
--    без неё, и достижение считается с первой игры после выката.
--
-- 2. Список турниров клуба. «Разогрев», «Втянулся» и «Железный график» — 3, 6 и 9
--    турниров клуба подряд без пропусков. Чтобы знать, пропущен ли вечер, нужен список
--    всех игр клуба. Одна строка на игру вместо тысяч строк результатов: профиль
--    спрашивает его при каждом открытии.
--
-- Без миграции приложение работает как раньше: очерёдность не пишется, а серии без
-- пропусков стоят на нуле.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

alter table public.tournament_results
  add column if not exists seat_order integer
    constraint tournament_results_seat_order_positive check (seat_order > 0);

create or replace function public.list_club_games()
returns table (started_at timestamptz)
language sql
stable
set search_path = public
as $$
  select distinct results.started_at
  from public.tournament_results as results
  order by results.started_at;
$$;

revoke all on function public.list_club_games() from public, anon;
grant execute on function public.list_club_games() to service_role;
