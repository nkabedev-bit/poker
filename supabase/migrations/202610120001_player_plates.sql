-- Плашка игрока на экране в зале.
--
-- Игрок со статусом выбирает в мини-аппе форму плашки и один из десяти цветов клуба.
-- Чем выше статус, тем больше форм открыто. Плашки APC и «2-ое место APC» выдаются
-- поимённо, у них свой цвет — цвет не хранится.
--
-- Без выбора (null) экран рисует плашку статуса, как раньше. Проверку статуса и
-- поимённых плашек делает приложение; база держит только список допустимых значений.
-- Новая форма или цвет — новая миграция, которая расширяет проверки.
--
-- Приложение читает колонки отдельными запросами и переживает их отсутствие: пока
-- миграция не применена, на экране статусные плашки, а сохранение отвечает, что
-- плашки ещё не включены.
--
-- Повторный запуск безопасен.

alter table public.client_bot_users
  add column if not exists plate_form text
    constraint client_bot_users_plate_form_known check (
      plate_form in (
        'button', 'bluff', 'flop',
        'all_in', 'chip_leader', 'straight',
        'satellite', 'quads', 'gatsby',
        'jackpot', 'nuts', 'triumph', 'royal_flush',
        'apc', 'apc_second'
      )
    ),
  add column if not exists plate_color text
    constraint client_bot_users_plate_color_known check (
      plate_color in (
        'ruby', 'garnet', 'copper', 'emerald', 'teal',
        'sapphire', 'indigo', 'amethyst', 'peony', 'platinum'
      )
    );
