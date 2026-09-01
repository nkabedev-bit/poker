import { Bot, webhookCallback, type Context } from "grammy";
import { createClient } from "@supabase/supabase-js";
import {
  buildClientMiniAppReplyMarkup,
  CLIENT_BOT_WELCOME_TEXT,
} from "@/lib/client-bot/registration";
import { safeAnswerCallbackQuery } from "@/lib/client-bot/callback-query";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The bot is a doorway, nothing more: everything a player does — the questionnaire,
// the tournament schedule, signing up, the profile — lives in the mini-app. The bot
// still owns the client_bot_users row, which is what the mini-app authenticates
// against and what the broadcasts are sent to.
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

  await getAdminSupabase()
    .from("client_bot_users")
    .upsert(
      {
        chat_id: chatId,
        first_name: from?.first_name ?? null,
        last_name: from?.last_name ?? null,
        telegram_id: telegramId,
        username: from?.username ?? null,
      },
      { onConflict: "telegram_id" },
    );
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
