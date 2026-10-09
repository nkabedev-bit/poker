-- Роли админов: флор и дилер.
--
-- Флор ведёт весь вечер: касса, турнир, афиши, бот. Дилер работает за столами — «Зал»
-- (с заявками) и «Вылеты», остальное ему закрыто и в мини-аппе, и на сервере
-- (lib/tma/roles.ts, requireTmaAuth с floorOnly).
--
-- Все, кто уже в списке, становятся дилерами, кроме трёх флоров. Роли дальше меняют
-- в админ-боте командой /role двое главных (511564749 и 384428007) — они в коде
-- всегда флоры, что бы ни стояло здесь.
--
-- Применять ДО выката кода: новый код читает колонку role, без неё все админы
-- получат отказ. Старому коду колонка не мешает. Повторный запуск безопасен.

alter table public.tma_admins
  add column if not exists role text not null default 'dealer';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tma_admins_role_check'
  ) then
    alter table public.tma_admins
      add constraint tma_admins_role_check check (role in ('floor', 'dealer'));
  end if;
end $$;

update public.tma_admins
set role = 'floor'
where telegram_id in (511564749, 384428007, 5079025064);
