import { parseRoleWord, ROLE_LABELS, type TmaRole } from "@/lib/tma/roles";
import { MIN_WEB_PASSWORD_LENGTH } from "@/lib/tma/web-session";

/**
 * What /webpass does and what it takes, sent on any slip and shown in /info: it is set
 * once and changed when somebody leaves, long after anyone remembers how.
 */
export const WEB_PASSWORD_COMMAND_HELP = [
  "/webpass <флор|дилер> <пароль> — задать пароль входа в админку из браузера (без Telegram).",
  `Пароль флора открывает всё, пароль дилера — только «Зал» и «Вылеты». Не короче ${MIN_WEB_PASSWORD_LENGTH} символов, пароли должны различаться.`,
  "Сообщение с паролем бот сразу удаляет из чата. После смены все, кто входил старым паролем этой роли, выходят — так закрывают доступ ушедшему дилеру.",
  "Пример: /webpass дилер придумайте-свой-пароль",
].join("\n");

export function parseWebPasswordCommand(
  text: string,
): { password: string; role: TmaRole } | { error: string } {
  const match = text.trim().match(/^\/webpass(?:@\S+)?\s+(\S+)\s+([\s\S]+)$/i);
  const role = parseRoleWord(match?.[1]);
  if (!match || !role) return { error: WEB_PASSWORD_COMMAND_HELP };

  const password = match[2].trim();
  if (password.length < MIN_WEB_PASSWORD_LENGTH) {
    return { error: `Пароль слишком короткий — нужно не меньше ${MIN_WEB_PASSWORD_LENGTH} символов. Сообщение удалено, пришлите заново.` };
  }

  return { password, role };
}

export function buildWebPasswordSavedReply(role: TmaRole, deskUrl: string) {
  return [
    `Пароль для роли «${ROLE_LABELS[role]}» сохранён, сообщение с ним удалено из чата.`,
    `Все, кто входил в браузере старым паролем этой роли, вышли.`,
    `Вход: ${deskUrl}`,
  ].join("\n");
}
