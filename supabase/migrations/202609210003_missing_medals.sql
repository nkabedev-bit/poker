-- Пять медалей, которых не хватало в первом переносе.
--
-- Перенос 202609050008 делался по памяти владельца, и в нём оказались пробелы: MaksB
-- выиграл Bounty 27.03.2026, Adam Smasher брал Phoenix, и ещё трое числятся в списке
-- клуба, но не в базе. Сверка полного списка с начисленным нашла ровно эти пять.
--
-- Ставит значение, а не прибавляет, и сверяет ник по ключу — как и первый перенос,
-- так что повторный прогон ничего не ломает.
--
-- Anderson, DanyaZver и Konstantin в боте не зарегистрированы, и их медали лечь
-- сейчас некуда. Они остаются здесь: когда человек заведёт аккаунт, достаточно
-- прогнать этот файл ещё раз.

with wanted (nickname, medals) as (
  values
    ('MaksB',        '{"bounty":1}'::jsonb),
    ('Adam Smasher', '{"phoenix":1}'::jsonb),
    ('Anderson',     '{"bounty":1}'::jsonb),
    ('DanyaZver',    '{"bounty":1}'::jsonb),
    ('Konstantin',   '{"deepstack":1}'::jsonb)
),
keyed as (
  select
    w.medals,
    regexp_replace(lower(w.nickname), '[^a-z0-9а-яё]', '', 'g') as nickname_key
  from wanted w
),
alone as (
  select k.medals, k.nickname_key
  from keyed k
  join public.client_bot_users u on u.nickname_key = k.nickname_key
  group by k.medals, k.nickname_key
  having count(u.id) = 1
)
update public.client_bot_users u
set medals = coalesce(u.medals, '{}'::jsonb) || a.medals
from alone a
where u.nickname_key = a.nickname_key;
