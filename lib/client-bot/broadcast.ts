import "server-only";

import { Bot, GrammyError } from "grammy";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllPages } from "@/lib/supabase/read-all-pages";

/**
 * How many chats a broadcast writes to at once. Telegram lets a bot send about thirty
 * messages a second to different chats; a batch of this size a second stays under it.
 */
const SEND_BATCH_SIZE = 25;
const SEND_BATCH_MS = 1000;

export function getClientBot(): Bot | null {
  const token = process.env.CLIENT_TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return new Bot(token);
}

/**
 * Every chat a broadcast goes to — only the accounts the bot can actually write to. A
 * player who signed in on the web has no chat, and sending to nothing would have counted
 * every one of them as a failed delivery. Read a page at a time: past a thousand
 * subscribers a single request quietly left the newest of them out.
 */
export async function readBroadcastChats(supabase: SupabaseClient): Promise<number[]> {
  const rows = await readAllPages<{ chat_id: number | string }>((from, to) =>
    supabase
      .from("client_bot_users")
      .select("chat_id")
      .not("chat_id", "is", null)
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to),
  );

  return rows.map((row) => Number(row.chat_id));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Once more after Telegram's "too many requests", as long as it asked us to wait. */
async function sendOrRetry(send: () => Promise<unknown>) {
  try {
    await send();
  } catch (error) {
    const retryAfter = error instanceof GrammyError ? error.parameters?.retry_after : undefined;
    if (!retryAfter) throw error;

    await wait(retryAfter * 1000);
    await send();
  }
}

/**
 * Hands `send` every chat, a batch a second rather than one at a time: one by one, a few
 * hundred subscribers took longer than the function is allowed to run, and a broadcast
 * cut off halfway left the rest without it and the admin without a count.
 */
export async function sendToChats(
  chats: number[],
  send: (chatId: number) => Promise<unknown>,
): Promise<{ failed: number; sent: number }> {
  let sent = 0;
  let failed = 0;

  for (let offset = 0; offset < chats.length; offset += SEND_BATCH_SIZE) {
    const startedAt = Date.now();
    const batch = chats.slice(offset, offset + SEND_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((chatId) => sendOrRetry(() => send(chatId))));

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        sent += 1;
        return;
      }

      failed += 1;
      console.error("Client bot broadcast failed", { chatId: batch[index], error: result.reason });
    });

    const elapsed = Date.now() - startedAt;
    if (offset + SEND_BATCH_SIZE < chats.length && elapsed < SEND_BATCH_MS) {
      await wait(SEND_BATCH_MS - elapsed);
    }
  }

  return { failed, sent };
}

export async function sendTextToClientUsers(
  bot: Bot,
  supabase: SupabaseClient,
  message: string,
): Promise<{ sent: number; failed: number; total: number }> {
  const chats = await readBroadcastChats(supabase);
  const { failed, sent } = await sendToChats(chats, (chatId) =>
    bot.api.sendMessage(chatId, message),
  );

  return { failed, sent, total: chats.length };
}
