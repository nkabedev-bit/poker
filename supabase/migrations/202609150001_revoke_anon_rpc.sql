-- Серверные функции — только для сервера.
--
-- Проверка 15.09.2026 показала: роль anon — то есть любой, у кого есть публичный ключ Supabase из
-- приложения, — могла вызывать через /rest/v1/rpc почти все SECURITY DEFINER функции: начислять
-- проходки (adjust_free_entries), записывать кого угодно на турнир, выбивать и удалять игроков,
-- отмечать оплату. Строки `revoke all ... from public` в старых миграциях этого не закрывали:
-- Supabase выдаёт anon право на функции в public отдельно.
--
-- Приложение зовёт эти функции только с сервера, ключом service_role: TMA, оба бота, запись
-- игроков. Открытой остаётся только get_public_state — её читает экран в зале без входа.
-- Задачи pg_cron работают от владельца функций, их это не затрагивает.
--
-- service_role право выдаётся явно: иначе функция, которую он получал только через public,
-- перестала бы работать и в мини-приложении.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname <> 'get_public_state'
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end;
$$;
