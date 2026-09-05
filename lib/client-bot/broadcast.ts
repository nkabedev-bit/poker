import "server-only";

import { Bot } from "grammy";
import type { SupabaseClient } from "@supabase/supabase-js";

export function getClientBot(): Bot | null {
  const token = process.env.CLIENT_TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return new Bot(token);
}

export async function sendTextToClientUsers(
  bot: Bot,
  supabase: SupabaseClient,
  message: string,
): Promise<{ sent: number; failed: number; total: number }> {
  // Only the accounts the bot can actually write to. A player who signed in on the web
  // has no chat, and sending to nothing would have counted every one of them as a
  // failed delivery — telling the admin a broadcast half failed when it did not.
  const { data: users, error } = await supabase
    .from("client_bot_users")
    .select("chat_id")
    .not("chat_id", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;

  for (const user of users ?? []) {
    try {
      await bot.api.sendMessage(Number(user.chat_id), message);
      sent += 1;
    } catch (error) {
      console.error("Scheduled broadcast send failed", { chatId: user.chat_id, error });
      failed += 1;
    }
  }

  return { sent, failed, total: users?.length ?? 0 };
}
