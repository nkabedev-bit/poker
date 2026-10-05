import { Bot } from "grammy";

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Where the club's bots reach the Bot API: Telegram itself unless TELEGRAM_API_ROOT says
 * otherwise. A server in Russia cannot reach api.telegram.org, so there the variable
 * points at a relay that answers on the same paths — `/bot<token>/<method>` and
 * `/file/bot<token>/<path>`.
 */
export function telegramApiRoot() {
  const configured = process.env.TELEGRAM_API_ROOT?.trim();
  return (configured || TELEGRAM_API).replace(/\/+$/, "");
}

/** A grammY bot whose every call goes through `telegramApiRoot()`. */
export function createBot(token: string) {
  return new Bot(token, { client: { apiRoot: telegramApiRoot() } });
}
