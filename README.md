# Poker Tournament Timer MVP

Веб-приложение для живого покерного турнира: организатор управляет настройками и таймером в админке, а публичный экран открывается по секретной ссылке и обновляется через интернет.

## Что внутри

- Next.js App Router.
- Supabase Auth для входа организатора.
- Supabase Postgres для одного активного турнира.
- Supabase Storage для логотипа турнира.
- Supabase Realtime Broadcast для обновления публичного экрана.
- Публичный экран по секретному токену без логина.
- Таймер без записи каждой секунды в базу: сервер хранит состояние, экран считает секунды локально.

## Локальный запуск

```bash
corepack pnpm install
cp .env.example .env.local
corepack pnpm dev
```

Открыть:

- `http://localhost:3000/login`
- `http://localhost:3000/admin/settings`
- `http://localhost:3000/screen/<public-token>`

## Environment Variables

Заполни `.env.local` локально и эти же переменные в Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAIL=admin@example.com
```

`SUPABASE_SERVICE_ROLE_KEY` должен быть только server-side secret. Не публикуй его в браузере и не коммить `.env.local`.

## Supabase Setup

1. Создай новый Supabase project.
2. Открой SQL Editor.
3. Выполни SQL из `supabase/migrations/202604280001_poker_mvp.sql`.
4. В Authentication создай пользователя-организатора с email/password.
5. Скопируй значения из Project Settings:
   - Project URL -> `NEXT_PUBLIC_SUPABASE_URL`
   - anon/publishable key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key -> `SUPABASE_SERVICE_ROLE_KEY`

После миграции появится демо-турнир `POKER CLUB / DEMO`, стартовые блайнды и `public_token`.

Получить публичный токен можно запросом в Supabase SQL Editor:

```sql
select public_token from public.tournaments limit 1;
```

## Vercel Deploy

1. Создай GitHub repo и запушь проект.
2. Импортируй repo в Vercel.
3. Добавь environment variables из `.env.example`.
4. Deploy.

Build command:

```bash
corepack pnpm build
```

Install command:

```bash
corepack pnpm install
```

## Проверки

```bash
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

E2E smoke test публичного экрана требует реальный Supabase token:

```bash
TEST_PUBLIC_TOKEN=<public-token> corepack pnpm e2e
```

Без `TEST_PUBLIC_TOKEN` e2e тест корректно пропускается.

## Основные маршруты

- `/login` - вход организатора.
- `/admin/settings` - название, логотип, стартовый стек, регистрация, публичная ссылка.
- `/admin/blinds` - структура блайндов, ante, длительность, пресеты.
- `/admin/timer` - старт, пауза, следующий/предыдущий уровень, закрытие регистрации, завершение.
- `/screen/[publicToken]` - публичный экран для телевизора/проектора.

## Superpowers Docs

- `docs/superpowers/specs/2026-04-28-poker-tournament-mvp-design.md`
- `docs/superpowers/plans/2026-04-28-poker-tournament-mvp.md`

## Reference Screenshots

Папки со скриншотами в корне проекта оставлены как визуальный reference для дальнейшей доводки дизайна.
