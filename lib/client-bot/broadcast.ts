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
  const { data: users, error } = await supabase
    .from("client_bot_users")
    .select("chat_id")
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
