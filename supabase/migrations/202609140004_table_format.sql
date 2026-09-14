-- Формат стола: 6, 7, 9 или 10 макс.
--
-- Формат по умолчанию — в настройках турнира («Формат стола»). За каждым столом его можно
-- поменять кнопками «+ место» / «− место» прямо в мини-приложении, когда пришли опоздавшие:
-- в настройки лезть не нужно. Формат пишется в data->'tableFormats', по элементу на стол
-- (null — как в настройках).
--
-- Меняется под блокировкой строки турнира и только поле tableFormats: ростер, который в
-- ту же секунду пишут посадки, не перезаписывается. Снять стул, на котором сидит игрок,
-- нельзя.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

create or replace function public.set_table_format(
  p_tournament_id uuid,
  p_table integer,
  p_format integer,
  p_removed_seats integer[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  formats jsonb;
  holder text := null;
  taken_seat integer;
begin
  if p_table is null or p_table < 1 or p_table > 50 then
    raise exception 'Invalid table' using errcode = 'P0001';
  end if;

  if p_format is null or p_format < 1 or p_format > 10 then
    raise exception 'Invalid table format' using errcode = 'P0001';
  end if;

  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament extras not found' using errcode = 'P0002';
  end if;

  -- Стул уносят только пустой: игрок, который на нём сидит, сначала пересаживается.
  select (item->>'seat')::integer, coalesce(item->>'name', 'игрок')
  into taken_seat, holder
  from jsonb_array_elements(coalesce(extras_row.data->'players', '[]'::jsonb)) as item
  where coalesce(item->>'status', '') = 'active'
    and coalesce(item->>'table', '') ~ '^[0-9]+$'
    and (item->>'table')::integer = p_table
    and coalesce(item->>'seat', '') ~ '^[0-9]+$'
    and (item->>'seat')::integer = any(coalesce(p_removed_seats, '{}'::integer[]))
  limit 1;

  if holder is not null then
    raise exception 'Seat % is taken by %', taken_seat, holder using errcode = 'P0001';
  end if;

  formats := case
    when jsonb_typeof(extras_row.data->'tableFormats') = 'array' then extras_row.data->'tableFormats'
    else '[]'::jsonb
  end;

  while jsonb_array_length(formats) < p_table loop
    formats := formats || 'null'::jsonb;
  end loop;

  formats := jsonb_set(formats, array[(p_table - 1)::text], to_jsonb(p_format));

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('tableFormats', formats)
  where tournament_id = p_tournament_id;

  return formats;
end;
$$;

-- Новая функция по умолчанию доступна всем ролям, включая anon: без revoke её мог бы вызвать
-- кто угодно с публичным ключом Supabase. Мини-приложение зовёт её с сервера.
revoke all on function public.set_table_format(uuid, integer, integer, integer[]) from public, anon;
grant execute on function public.set_table_format(uuid, integer, integer, integer[])
  to authenticated, service_role;
