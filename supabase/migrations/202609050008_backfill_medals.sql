-- Медали за победы, которые клуб помнит, а база — ещё нет.
--
-- Счётчики медалей начали заполняться только после 202609050006, а турниры игрались
-- задолго до него. Это разовый перенос той истории со слов владельца клуба: ник,
-- турнир и сколько раз выигран.
--
-- Ставит значение, а не прибавляет: перечисленные медали получают названное число,
-- остальные у игрока остаются как были. Повторный прогон ничего не меняет.
--
-- Ник сверяется по тому же ключу, что генерирует база: регистр, пробелы и знаки
-- отброшены, так что «Adam Smasher», «adam_smasher» и «ADAMSMASHER» — один игрок.
-- Аккаунт, которого нет, и ник, который носят двое, пропускаются молча: наградить
-- не того хуже, чем не наградить никого.

with wanted (nickname, medals) as (
  values
    ('Titan', '{"phoenix":1}'::jsonb),
    ('Adam Smasher', '{"phoenix":1}'::jsonb),
    ('Superman', '{"phoenix":1,"bounty":1,"lastchance":1}'::jsonb),
    ('123', '{"phoenix":1}'::jsonb),
    ('1$', '{"deepstack":1}'::jsonb),
    ('Smartrichstyle', '{"deepstack":1,"mystery":1,"bounty":1}'::jsonb),
    ('Konstantin', '{"deepstack":1}'::jsonb),
    ('Seller', '{"deepstack":3,"bounty":1,"lastchance":1}'::jsonb),
    ('GWTeam', '{"deepstack":1,"bounty":1,"lastchance":1}'::jsonb),
    ('Малина', '{"deepstack":1,"bounty":1}'::jsonb),
    ('MDG-killer', '{"deepstack":1,"bounty":1}'::jsonb),
    ('Gal', '{"mystery":2,"bounty":1}'::jsonb),
    ('NoCappy', '{"bounty":1}'::jsonb),
    ('JTXhack', '{"mystery":1}'::jsonb),
    ('DanyaZver', '{"bounty":1}'::jsonb),
    ('Киберпсих', '{"bounty":1}'::jsonb),
    ('ab1turent', '{"mystery":1}'::jsonb),
    ('ТаМаша', '{"bounty":1}'::jsonb),
    ('Javmaz', '{"mystery":1}'::jsonb),
    ('Даня Хэнс', '{"bounty":1}'::jsonb),
    ('Seka_Machine', '{"mystery":1,"bounty":1}'::jsonb),
    ('AleksPtz', '{"bounty":1}'::jsonb),
    ('inrikki', '{"bounty":1}'::jsonb),
    ('Pauli', '{"bounty":1}'::jsonb),
    ('Anderson', '{"bounty":1}'::jsonb),
    ('tsaWinner', '{"lastchance":1}'::jsonb),
    ('Саймон', '{"lastchance":1}'::jsonb)
),
keyed as (
  select w.nickname, w.medals, regexp_replace(lower(w.nickname), '[^a-z0-9а-яё]', '', 'g') as nickname_key
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
