import { parseRoleWord, ROLE_LABELS, type TmaRole } from "@/lib/tma/roles";

/**
 * What /role does and what it takes. Sent on any slip as well as in /info: the command
 * is used a few times a year, and nobody remembers the order of its words by then.
 */
export const ROLE_COMMAND_HELP = [
  "/role <telegram_id> <флор|дилер> — сменить роль админа.",
  "Флор — полный доступ: касса, турнир, афиши, рассылка и все команды бота.",
  "Дилер — только вкладки «Зал» и «Вылеты»; из команд бота — /start и /info.",
  "Пример: /role 123456789 дилер",
  "ID и роли всех админов — /admins. Новый админ из /addadmin становится дилером.",
].join("\n");

export function parseRoleCommand(text: string): { role: TmaRole; telegramId: number } | null {
  const match = text.trim().match(/^\/role(?:@\S+)?\s+(\d+)\s+(\S+)$/i);
  if (!match) return null;

  const telegramId = Number(match[1]);
  const role = parseRoleWord(match[2]);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0 || !role) return null;

  return { role, telegramId };
}

export function buildRoleChangedReply(name: string, telegramId: number, role: TmaRole) {
  const access =
    role === "floor"
      ? "полный доступ: касса, турнир, афиши, рассылка и все команды бота"
      : "только «Зал» и «Вылеты», из команд бота — /start и /info";

  return `${name} (${telegramId}) теперь ${ROLE_LABELS[role]}: ${access}. Мини-апп подхватит роль при следующем открытии.`;
}
