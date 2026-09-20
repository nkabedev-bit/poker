-- Объявление о вылете на экране в зале.
--
-- Когда игрок выбывает, зал должен это увидеть: ник, аватарка, какое место занял — или
-- что он берёт ре-энтри, — и кто его выбил, если клуб ведёт нокауты.
--
-- Событие записывается в момент вылета, а не вычисляется экраном из состава игроков.
-- Причина в ре-энтри: игрок остаётся за столом с тем же статусом, и в следующей копии
-- ростера ничего не говорит о том, что он вылетал. Два вылета между двумя опросами
-- экрана тоже слились бы в один.
--
-- Хранится последняя горстка объявлений, а не одно: на финальном столе двое могут выбыть
-- подряд, и зал должен услышать про обоих. Экран показывает те, что ещё не показывал.
--
-- Отдельная функция, а не часть record_player_elimination: та переписывается целиком в
-- каждой миграции, которая её трогает, и баннер там был бы лишним поводом её ломать.
-- Запись идёт под блокировкой строки — вылет и параллельный аддон не должны затирать
-- друг друга.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

create or replace function public.push_tournament_knockout(
  p_tournament_id uuid,
  p_knockout jsonb,
  p_keep integer default 6
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  banners jsonb;
  keep integer := greatest(1, coalesce(p_keep, 6));
begin
  if p_knockout is null or jsonb_typeof(p_knockout) <> 'object' then
    raise exception 'Knockout banner is required' using errcode = 'P0001';
  end if;

  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament extras not found' using errcode = 'P0002';
  end if;

  banners := coalesce(extras_row.data->'knockouts', '[]'::jsonb);
  if jsonb_typeof(banners) <> 'array' then
    banners := '[]'::jsonb;
  end if;

  banners := banners || jsonb_build_array(p_knockout);

  -- Новейшие в конце: старшие отбрасываются, когда список перерос свою длину.
  if jsonb_array_length(banners) > keep then
    select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
    into banners
    from jsonb_array_elements(banners) with ordinality as t(item, ordinality)
    where ordinality > jsonb_array_length(banners) - keep;
  end if;

  update public.tournament_extras
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('knockouts', banners)
  where tournament_id = p_tournament_id;

  return banners;
end;
$$;

-- Как и остальные серверные функции: зовёт её только сервер приложения ключом service_role.
revoke execute on function public.push_tournament_knockout(uuid, jsonb, integer) from public, anon;
grant execute on function public.push_tournament_knockout(uuid, jsonb, integer) to service_role;
