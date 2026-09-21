-- Медали за турниры, которых клуб больше не проводит.
--
-- MTT Classic, Wanted Bounty и Dealer Revenge остались в прошлом, и медаль за них
-- неоткуда взять: у первых двух нет ключа в коде вовсе, а Dealer Revenge код медалью
-- никогда не считал. Часть этих вечеров к тому же сыграна до того, как игры начали
-- записываться, — ни одной строки в результатах о них нет, и считать не из чего.
--
-- Поэтому они живут отдельной колонкой и показываются отдельной секцией: счётчик
-- действующих медалей остаётся семёркой, а архив просто лежит под ним.
--
-- Это разовый перенос со слов владельца клуба. Ставит значение, а не прибавляет:
-- повторный прогон ничего не меняет. Ник сверяется по тому же ключу, что генерирует
-- база, — регистр, пробелы и знаки отброшены. Аккаунт, которого нет, и ник, который
-- носят двое, пропускаются молча: наградить не того хуже, чем не наградить никого.
--
-- Рус, победитель MTT Classic 19.03.2026, в боте не зарегистрирован — его медаль
-- ждёт здесь и встанет на место, когда он заведёт аккаунт и строку прогонят заново.

alter table public.client_bot_users
  add column if not exists archive_medals jsonb not null default '{}'::jsonb;

with wanted (nickname, medals) as (
  values
    -- MTT Classic
    ('Superman',     '{"mttclassic":1}'::jsonb),
    ('Рус',          '{"mttclassic":1}'::jsonb),
    ('Саймон',       '{"mttclassic":1}'::jsonb),
    -- Wanted Bounty
    ('Sick boy',     '{"wanted":1}'::jsonb),
    ('Secret',       '{"wanted":1}'::jsonb),
    ('Киберпсих',    '{"wanted":1}'::jsonb),
    ('Gooffy',       '{"wanted":1}'::jsonb),
    -- Dealer Revenge
    ('Seller',       '{"dealer":1}'::jsonb),
    ('Chura',        '{"dealer":1}'::jsonb),
    ('Танатос',      '{"dealer":1}'::jsonb),
    ('Kr.ma.vl',     '{"dealer":1}'::jsonb),
    ('Adam Smasher', '{"dealer":1}'::jsonb),
    ('ТаМаша',       '{"dealer":1}'::jsonb)
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
set archive_medals = coalesce(u.archive_medals, '{}'::jsonb) || a.medals
from alone a
where u.nickname_key = a.nickname_key;
