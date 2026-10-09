-- Пароли входа в админку из браузера (pokerptz.ru/tma без Telegram).
--
-- Два общих пароля: флорский и дилерский, роль определяется паролем. Задают и меняют
-- их двое главных командой /webpass в админ-боте. Хранится только хеш scrypt с солью
-- (lib/tma/web-session.ts); смена пароля закрывает все браузерные входы с этой ролью.
--
-- Таблицу читает только сервер ключом service_role: ни anon, ни authenticated (старая
-- веб-панель /admin) к хешам доступа не имеют.
--
-- Пока миграция не применена, вход из браузера отвечает «неверный пароль», Telegram
-- работает как раньше. Повторный запуск безопасен.

create table if not exists public.tma_web_passwords (
  role text primary key check (role in ('floor', 'dealer')),
  password_hash text not null,
  updated_by bigint,
  updated_at timestamptz not null default now()
);

alter table public.tma_web_passwords enable row level security;

revoke all on table public.tma_web_passwords from anon, authenticated;
grant select, insert, update, delete on table public.tma_web_passwords to service_role;
