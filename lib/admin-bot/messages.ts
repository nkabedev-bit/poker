import { CANCELLED_SIGNUP_DAYS } from "@/lib/admin-bot/cancellations";
import { NICKNAME_CHANGES_DAYS } from "@/lib/admin-bot/nickname-changes";
import { SIGNUP_BAN_DAYS } from "@/lib/client-bot/signup-ban";
import { DEBT_ALLOWANCE_DAYS } from "@/lib/debts/ledger";
import { UPCOMING_BIRTHDAY_DAYS } from "@/lib/google-sheets";
import { ROLE_COMMAND_HELP } from "@/lib/admin-bot/role-command";
import type { TmaRole } from "@/lib/tma/roles";

// Only what a line needs. Keeping it to this lets the same formatter serve whatever
// found the birthdays — the accounts today, something else tomorrow.
type BirthdayLine = { date: string; nickname: string };
type UpcomingBirthday = BirthdayLine & { daysUntil: number };

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
    return `${header}\n\nНикого нет. Дата рождения берётся из анкеты игрока.`;
  }

  const lines = birthdays.map(
    (birthday) => `${birthday.date} — ${birthday.nickname} (${formatDaysUntil(birthday.daysUntil)})`,
  );

  return `${header}\n\n${lines.join("\n")}`;
}

/**
 * The summary the club asked for on the first of every month: everyone with a birthday
 * in it, in the order the days come round.
 */
export function buildMonthBirthdaysMessage(birthdays: BirthdayLine[], month: string) {
  const header = `🎂 Дни рождения — ${month}`;
  if (birthdays.length === 0) return `${header}\n\nВ этом месяце именинников нет.`;

  const lines = birthdays.map((birthday) => `${birthday.date} — ${birthday.nickname}`);

  return `${header}\n\n${lines.join("\n")}`;
}

// What Telegram shows in the bot's own command menu (the "/" button). Applied by
// /setupmenu — without it a new command exists but stays invisible in the menu until
// somebody adds it in BotFather by hand.
export const ADMIN_BOT_MENU_COMMANDS = [
  { command: "start", description: "Панель управления турниром" },
  { command: "info", description: "Список команд" },
  { command: "birthday", description: "Дни рождения на ближайший месяц" },
  { command: "cancel", description: "Кто отменил запись за последние дни" },
  { command: "changes", description: "Кто сменил ник за последний месяц" },
  { command: "ban", description: "Закрыть игроку запись на игры: <ник>" },
  { command: "unban", description: "Снять запрет на запись: <ник>" },
  { command: "allowdebt", description: "Пустить должника на запись: <ник> [дней]" },
  { command: "denydebt", description: "Снять разрешение должнику: <ник>" },
  { command: "clearsheet", description: "Очистить лист сегодняшней игры" },
  { command: "resync", description: "Переписать лист игры из базы" },
  { command: "visits", description: "Пересобрать лист «посещения»" },
  { command: "givecolor", description: "Выдать метку игроку: <метка> to <ник>" },
  { command: "removecolor", description: "Снять метку с игрока: <ник>" },
  { command: "free", description: "Выдать проходки: [vip] <ник> [сколько]" },
  { command: "role", description: "Роль админа: <telegram_id> флор|дилер" },
  { command: "admins", description: "Админы и их роли" },
];

// The /info replies, kept next to the digest so the texts are unit-testable and the
// webhook stays a thin wrapper.

/** What a dealer may ask the bot for: the panel and this list, nothing else. */
const DEALER_COMMANDS_MESSAGE = [
  "📋 Команды бота",
  "",
  "/start — открыть панель управления турниром",
  "/info — этот список команд",
  "",
  "Вы — дилер: в панели открыты вкладки «Зал» и «Вылеты». Остальное — у флора.",
].join("\n");

const FLOOR_COMMANDS_MESSAGE = [
  "📋 Команды бота",
  "",
  "Для администраторов:",
  "/start — открыть панель управления турниром",
  "/info — этот список команд",
  `/birthday — дни рождения игроков на ближайшие ${UPCOMING_BIRTHDAY_DAYS} дн.`,
  `/cancel — кто отменил запись на игру за последние ${CANCELLED_SIGNUP_DAYS} дн.`,
  `/changes — кто сменил ник в приложении за последние ${NICKNAME_CHANGES_DAYS} дн.`,
  `/ban <ник> — закрыть игроку запись на игры на ${SIGNUP_BAN_DAYS} дней за частые отмены.`,
  "Записи на ближайшие игры снимаются, места уходят в лист ожидания; живая очередь остаётся.",
  "/unban <ник> — снять запрет досрочно",
  `/allowdebt <ник> [дней] — разрешить должнику записываться (по умолчанию ${DEBT_ALLOWANCE_DAYS} дн.).`,
  "Долг остаётся, напоминания на это время выключаются; когда срок выйдет, бот напишет вам.",
  "/denydebt <ник> — снять это разрешение досрочно",
  "/clearsheet — очистить лист сегодняшней игры в таблице",
  "/resync — переписать лист игры заново из базы (если таблица отстала)",
  "/visits — пересобрать лист «посещения» (все игроки и число вечеров)",
  "/givecolor <метка> to <ник> — выдать игроку метку (например «дилер»)",
  "Уровни клуба: member (5+ игр), core (20+), legend (50+) считаются сами.",
  "/givecolor champion to <ник> — короновать чемпиона; так же можно выдать любой уровень вручную.",
  "/removecolor <ник> — снять метку с игрока",
  "/setupmenu — обновить меню команд в Telegram (после появления новых команд)",
  "",
  "Бесплатные проходки (владелец клуба):",
  "/free <ник> — выдать одну обычную проходку",
  "/free vip <ник> 3 — выдать три VIP-проходки",
  "/delete free <ник> 2 — снять две проходки, если выдали по ошибке",
  "Проходка закрывает только вход в турнир: ре-энтри и аддон игрок оплачивает сам.",
  "",
  "Уведомления о днях рождения приходят автоматически в 00:00 по Москве.",
].join("\n");

/** Who decides who works the desk: only the two people who run the staff see this. */
const ACCESS_COMMANDS_MESSAGE = [
  "Управление доступом (только главные):",
  "/addadmin <telegram_id> <Имя> — выдать доступ к панели (новый админ — дилер)",
  "/admins — список администраторов с ролями",
  "/removeadmin <telegram_id> — забрать доступ",
  ROLE_COMMAND_HELP,
].join("\n");

/**
 * The /info reply: every command this admin may use. A dealer sees only theirs; the
 * access commands are shown to the two who run the staff.
 */
export function buildAdminCommandsMessage({ manager, role }: { manager: boolean; role: TmaRole }) {
  if (role === "dealer") return DEALER_COMMANDS_MESSAGE;
  return manager ? `${FLOOR_COMMANDS_MESSAGE}\n\n${ACCESS_COMMANDS_MESSAGE}` : FLOOR_COMMANDS_MESSAGE;
}
