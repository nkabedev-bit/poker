import "server-only";

import { getClientBot } from "@/lib/client-bot/broadcast";
import { getClientMiniAppUrl } from "@/lib/client-bot/registration";

/**
 * The bot's own @name, which only Telegram knows.
 *
 * Asked for once and kept: a serverless instance answers many requests, and the name of
 * a bot does not change between them.
 */
let botUsername: string | null | undefined;

async function readBotUsername() {
  if (botUsername !== undefined) return botUsername;

  const bot = getClientBot();
  if (!bot) {
    botUsername = null;
    return botUsername;
  }

  try {
    botUsername = (await bot.api.getMe()).username ?? null;
  } catch (error) {
    // Without the name there is no Telegram link, and the web one still works.
    console.error("Could not ask Telegram for the bot's name", error);
    botUsername = null;
  }

  return botUsername;
}

export type DuoInviteLinks = { telegram: string | null; web: string | null };

/**
 * The two ways to open one invitation.
 *
 * Telegram lands in the bot, which makes the account and takes the invitation up before
 * the app is even opened. The web link is for a friend who does not use Telegram: they
 * sign in with Yandex, and the invitation is waiting on the tournament.
 */
export async function buildDuoInviteLinks(token: string | null): Promise<DuoInviteLinks> {
  if (!token) return { telegram: null, web: null };

  const username = await readBotUsername();
  const appUrl = getClientMiniAppUrl();

  return {
    telegram: username ? `https://t.me/${username}?start=duo_${token}` : null,
    web: appUrl ? `${appUrl}?invite=${encodeURIComponent(token)}` : null,
  };
}
