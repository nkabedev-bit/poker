import { getClientTelegramWebApp } from "../layout";

export const SUPPORT_TELEGRAM_URL = "https://t.me/markvasilyevv";

/**
 * Opens the chat with the club's administrator.
 *
 * Inside Telegram the chat opens in Telegram itself. On the web the Telegram script is
 * loaded too, and its openTelegramLink would take the whole app away to t.me — so there
 * the chat gets a tab of its own.
 */
export function openSupportChat(inTelegram: boolean) {
  const tg = getClientTelegramWebApp();
  tg?.HapticFeedback?.impactOccurred("light");

  if (inTelegram && tg?.openTelegramLink) {
    tg.openTelegramLink(SUPPORT_TELEGRAM_URL);
    return;
  }

  window.open(SUPPORT_TELEGRAM_URL, "_blank", "noopener");
}
