# План работ: Устранение состояний гонки и конфликтов записи (DB Concurrency Fix)

## Проблема
Все данные участников турнира (стеки, ребаи, аддоны, столы) хранятся в общем JSONB-поле `data` таблицы `tournament_extras`. Мутации (вылеты, перемещения за стол, добавление аддонов) выполняются методом **Read-Modify-Write** без блокировки строк. Если администратор сохраняет список игроков со страницы `/admin/players` параллельно с регистрацией нового игрока через бота в Telegram, то регистрация игрока полностью стирается.

---

## Предлагаемые решения

### Вариант А: Точечные RPC-функции с блокировкой строк (Быстрый и безопасный фикс)
Вместо перезаписи всего JSONB-документа через Node.js, все мутации игроков переносятся на сторону базы данных с помощью PostgreSQL RPC-функций, использующих блокировку `SELECT ... FOR UPDATE`.

### Вариант Б: Нормализация схемы БД (Долгосрочное системное решение)
Выделение сущностей игроков в плоскую таблицу `players` с внешним ключом к турниру.

---

## Пошаговый план реализации (Вариант А — RPC)

### Шаг 1. Создание SQL-функций для мутаций
Написать миграцию Supabase, добавляющую функции:
1. `update_tournament_player` — для изменения данных стола, стека или аддонов конкретного игрока.
2. `record_player_elimination` — для перевода игрока в статус `eliminated` с начислением баунти киллерам.
3. `cancel_player_elimination` — для отката статуса игрока.

Пример структуры функции в PL/pgSQL:
```sql
create or replace function public.update_tournament_player(
  p_tournament_id uuid,
  p_player_id text,
  p_patch jsonb
) returns jsonb as $$
declare
  extras_row tournament_extras%rowtype;
  players_list jsonb;
  updated_players jsonb := '[]'::jsonb;
  item jsonb;
begin
  -- Блокируем строку для предотвращения параллельных записей
  select * into extras_row 
  from public.tournament_extras 
  where tournament_id = p_tournament_id for update;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  for item in select * from jsonb_array_elements(players_list) loop
    if item->>'id' = p_player_id then
      updated_players := updated_players || (item || p_patch);
    else
      updated_players := updated_players || item;
    end if;
  end loop;

  update public.tournament_extras
  set data = data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated_players;
end;
$$ language plpgsql security definer;
```

### Шаг 2. Обновление эндпоинтов TMA и Server Actions
1. В `app/api/tma/players/[id]/route.ts` заменить вызов `saveTournamentExtras({ players })` на вызов созданного RPC `update_tournament_player`.
2. В `app/api/tma/eliminations/route.ts` и `app/api/tma/eliminations/[id]/cancel/route.ts` заменить перезапись всего массива игроков на вызов точечных RPC функций.
3. В Server Action `savePlayers` в `app/admin/extras/actions.ts` заменить сохранение всего списка. Поскольку администратор может менять несколько игроков одновременно, RPC должен принимать массив изменений и применять их в одной транзакции с блокировкой `FOR UPDATE`.

---

## Пошаговый план реализации (Вариант Б — Нормализация)

### Шаг 1. Создание таблицы `players` и миграция данных
1. Написать миграцию для создания таблицы `players` со следующими полями: `id` (uuid/text), `tournament_id` (uuid), `name` (text), `stack` (int), `table` (int), `seat` (int), `rebuys` (int), `addons` (int), `bounty_count` (numeric), `mystery_bounty_points` (numeric), `status` (text), `registered_via` (text), `telegram_id` (bigint), `registration_number` (int).
2. Написать скрипт миграции существующих данных из `tournament_extras.data->'players'` в новую таблицу.

### Шаг 2. Перенос логики запросов и мутаций
1. Обновить эндпоинты в `app/api/tma/players/...` для выполнения прямых запросов к таблице `players`.
2. Использовать стандартные транзакции Postgres для изменения статусов вылета игроков и начисления баунти.
3. Убрать ключ `players` из структуры `TournamentExtras` и типа `PublicTournamentState`.
