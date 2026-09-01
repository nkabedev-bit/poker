import { UPCOMING_BIRTHDAY_DAYS, type UpcomingBirthday } from "@/lib/google-sheets";

function formatDaysUntil(daysUntil: number) {
  if (daysUntil <= 0) return "сегодня";
  if (daysUntil === 1) return "завтра";
  return `через ${daysUntil} дн.`;
}

// The /birthday digest: who has a birthday in the coming month, nearest first.
export function buildBirthdayDigestMessage(
  birthdays: UpcomingBirthday[],
  days = UPCOMING_BIRTHDAY_DAYS,
) {
  const header = `🎂 Дни рождения — ближайшие ${days} дн.`;
  if (birthdays.length === 0) {
    return `${header}\n\nНикого нет. Список берётся из листа «анкеты» — там должна стоять дата рождения.`;
  }

  const lines = birthdays.map(
    (birthday) => `${birthday.date} — ${birthday.nickname} (${formatDaysUntil(birthday.daysUntil)})`,
  );

  return `${header}\n\n${lines.join("\n")}`;
}

// What Telegram shows in the bot's own command menu (the "/" button). Applied by
// /setupmenu — without it a new command exists but stays invisible in the menu until
// somebody adds it in BotFather by hand.
export const ADMIN_BOT_MENU_COMMANDS = [
  { command: "start", description: "Панель управления турниром" },
  { command: "info", description: "Список команд" },
  { command: "birthday", description: "Дни рождения на ближайший месяц" },
  { command: "clearsheet", description: "Очистить лист сегодняшней игры" },
  { command: "resync", description: "Переписать лист игры из базы" },
  { command: "givecolor", description: "Выдать метку игроку: <метка> to <ник>" },
  { command: "removecolor", description: "Снять метку с игрока: <ник>" },
];

// The /info reply: every command the admin bot answers. Kept next to the digest so both
// texts are unit-testable and the webhook stays a thin wrapper.
export const ADMIN_BOT_COMMANDS_MESSAGE = [
  "📋 Команды бота",
  "",
  "Для администраторов:",
  "/start — открыть панель управления турниром",
  "/info — этот список команд",
  `/birthday — дни рождения игроков на ближайшие ${UPCOMING_BIRTHDAY_DAYS} дн.`,
  "/clearsheet — очистить лист сегодняшней игры в таблице",
  "/resync — переписать лист игры заново из базы (если таблица отстала)",
  "/givecolor <метка> to <ник> — выдать игроку метку (например «дилер»)",
  "/removecolor <ник> — снять метку с игрока",
  "/setupmenu — обновить меню команд в Telegram (после появления новых команд)",
  "",
  "Только для супер-админа:",
  "/addadmin <telegram_id> <Имя> — выдать доступ к панели",
  "/admins — список администраторов",
  "/removeadmin <telegram_id> — забрать доступ",
  "",
  "Уведомления о днях рождения приходят автоматически в 00:00 по Москве.",
].join("\n");
