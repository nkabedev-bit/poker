import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientBot } from "@/lib/client-bot/broadcast";
import { buildClientMiniAppReplyMarkup } from "@/lib/client-bot/registration";

/**
 * Tells one player something in the club's bot, with the app one tap away.
 *
 * The bot is a doorway and stays one: it carries the news — a pair invitation, an
 * answer to it — and everything the player does about it happens in the mini-app.
 *
 * A message that cannot be delivered (the player blocked the bot, or never opened it)
 * is not a failure of whatever prompted it: the sign-up it belongs to already stands,
 * and the club sees the pair on its own screen either way.
 */
export async function notifyClientUser(
  supabase: SupabaseClient,
  telegramId: number,
  message: string,
): Promise<boolean> {
  const bot = getClientBot();
  if (!bot) return false;

  const { data } = await supabase
    .from("client_bot_users")
    .select("chat_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  const chatId = Number((data as { chat_id?: unknown } | null)?.chat_id);
  if (!Number.isFinite(chatId) || chatId === 0) return false;

  try {
    await bot.api.sendMessage(chatId, message, {
      reply_markup: buildClientMiniAppReplyMarkup(),
    });
    return true;
  } catch (error) {
    console.error("Client notification failed", { error, telegramId });
    return false;
  }
}
