-- Плашки Клубного чемпионата России: участника и финалиста личного зачёта.
--
-- Выдаются поимённо, как плашки APC (lib/players/plate-honors.ts), у них свой рисунок,
-- цвет не хранится. Здесь только расширяется список допустимых форм.
--
-- Повторный запуск безопасен.

alter table public.client_bot_users
  drop constraint if exists client_bot_users_plate_form_known;

alter table public.client_bot_users
  add constraint client_bot_users_plate_form_known check (
    plate_form in (
      'button', 'bluff', 'flop',
      'all_in', 'chip_leader', 'straight',
      'satellite', 'quads', 'gatsby',
      'jackpot', 'nuts', 'triumph', 'royal_flush',
      'apc', 'apc_second',
      'championship', 'championship_finalist'
    )
  );
