import { after } from "next/server";
import { Bot, webhookCallback, type Context } from "grammy";
import { createClient } from "@supabase/supabase-js";
import {
  buildClientMiniAppReplyMarkup,
  CLIENT_BOT_WELCOME_TEXT,
} from "@/lib/client-bot/registration";
import { safeAnswerCallbackQuery } from "@/lib/client-bot/callback-query";
import { shouldRefreshAvatar } from "@/lib/client-bot/avatar-policy";
import { syncClientBotAvatar } from "@/lib/client-bot/avatar";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The bot is a doorway, nothing more: everything a player does — the questionnaire,
// the tournament schedule, signing up, the profile — lives in the mini-app. The bot
// still owns the client_bot_users row, which is what the mini-app authenticates
// against, what the broadcasts are sent to, and where the avatar shown in the club
// standings comes from.
function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getBotToken() {
  return process.env.CLIENT_TELEGRAM_BOT_TOKEN || "mock";
}

async function upsertClientBotUser(ctx: Context) {
  const telegramId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!telegramId || !chatId) return;

  const from = ctx.from;
  const supabase = getAdminSupabase();

  await supabase.from("client_bot_users").upsert(
    {
      chat_id: chatId,
      first_name: from?.first_name ?? null,
      last_name: from?.last_name ?? null,
      telegram_id: telegramId,
      username: from?.username ?? null,
    },
    { onConflict: "telegram_id" },
  );

  // Telegram only hands the mini-app the photo of whoever opened it, so every other
  // face in the rating table has to be fetched here and stored. It runs after the
  // reply is sent: a slow download must never delay the bot.
  const { data } = await supabase
    .from("client_bot_users")
    .select("avatar_synced_at, avatar_is_custom")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!data?.avatar_is_custom && shouldRefreshAvatar(data?.avatar_synced_at ?? null, new Date())) {
    after(async () => {
      try {
        await syncClientBotAvatar({ supabase, telegramId, token: getBotToken() });
      } catch (error) {
        console.error("Non-critical avatar sync error:", error);
      }
    });
  }
}

async function sendWelcome(ctx: Context) {
  await ctx.reply(CLIENT_BOT_WELCOME_TEXT, {
    reply_markup: buildClientMiniAppReplyMarkup(),
  });
}

const bot = new Bot(getBotToken());

bot.command("start", async (ctx) => {
  await upsertClientBotUser(ctx);
  await sendWelcome(ctx);
});

bot.on("message", async (ctx) => {
  await upsertClientBotUser(ctx);
  await sendWelcome(ctx);
});

// Menus from before the mini-app take-over may still be sitting in old chats. Answer
// the callback so Telegram stops spinning, then point the player at the app.
bot.on("callback_query", async (ctx) => {
  await safeAnswerCallbackQuery(ctx);
  await upsertClientBotUser(ctx);
  await sendWelcome(ctx);
});

export const POST = webhookCallback(bot, "std/http", {
  secretToken: process.env.CLIENT_TELEGRAM_WEBHOOK_SECRET,
});
