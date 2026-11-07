import { after } from "next/server";
import { webhookCallback, type Context } from "grammy";
import { createBot } from "@/lib/telegram/bot-client";
import { createClient } from "@supabase/supabase-js";
import {
  buildClientMiniAppReplyMarkup,
  CLIENT_BOT_WELCOME_TEXT,
} from "@/lib/client-bot/registration";
import { safeAnswerCallbackQuery, safeEditMessageText } from "@/lib/client-bot/callback-query";
import { shouldRefreshAvatar } from "@/lib/client-bot/avatar-policy";
import { syncClientBotAvatar } from "@/lib/client-bot/avatar";
import {
  parsePassOfferCallback,
  passOfferAnswerText,
  type PassOfferAnswer,
} from "@/lib/free-entries/pass-offer";
import { switchSignupPass } from "@/lib/free-entries/switch-pass";
import {
  findRescheduleNotice,
  parseRescheduleCallback,
  rescheduleAnswerText,
  type RescheduleAnswer,
} from "@/lib/events/reschedule-notice";
import { answerRescheduleNotice } from "@/lib/events/reschedule-answers";

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

const bot = createBot(getBotToken());

/** The pass a "1+1" link carries: t.me/<bot>?start=duo_<token>. */
const DUO_INVITE_PREFIX = "duo_";

bot.command("start", async (ctx) => {
  await upsertClientBotUser(ctx);

  // Somebody arriving on a friend's link is here for one reason. The account exists by
  // now — upsert made it — so the ticket's second half is theirs before they are even
  // shown the door into the app.
  const payload = String(ctx.match ?? "").trim();
  if (payload.startsWith(DUO_INVITE_PREFIX)) {
    await takeUpDuoInvite(ctx, payload.slice(DUO_INVITE_PREFIX.length));
  }

  await sendWelcome(ctx);
});

/**
 * Hands the invitation to whoever followed the link.
 *
 * Never stops the welcome: a token already spent, or one the club no longer has, is
 * worth a line of explanation rather than a door that fails to open.
 */
async function takeUpDuoInvite(ctx: Context, token: string) {
  const telegramId = ctx.from?.id;
  if (!telegramId || !token) return;

  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("client_bot_users")
    .select("id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  const userId = (data as { id?: string } | null)?.id;
  if (!userId) return;

  try {
    const { claimDuoInvite } = await import("@/lib/events/duo");
    const outcome = await claimDuoInvite(supabase, { token, userId });

    await ctx.reply(
      outcome.error === null
        ? "Вас зовут вторым игроком по билету 1+1 — откройте приложение и подтвердите."
        : outcome.error === "taken"
          ? "Вас уже зовут вторым игроком на этот турнир."
          : "Приглашение больше не действует — возможно, его уже приняли.",
    );
  } catch (error) {
    console.error("Could not take up the pair invitation", error);
  }
}

bot.on("message", async (ctx) => {
  await upsertClientBotUser(ctx);
  await sendWelcome(ctx);
});

/**
 * The answer to "use the pass on your next game?" — the one question the bot still asks
 * itself, because a pass won after the poster filled up is worth a tap, not a trip into
 * the app. The question is replaced by what came of it, so it cannot be answered twice.
 */
async function answerPassOffer(ctx: Context, answer: PassOfferAnswer) {
  await safeAnswerCallbackQuery(ctx);

  const telegramId = ctx.from?.id;
  if (!answer.accept || !telegramId) {
    await safeEditMessageText(ctx, passOfferAnswerText(answer, null));
    return;
  }

  const supabase = getAdminSupabase();
  const { data: account } = await supabase
    .from("client_bot_users")
    .select("id, free_entries")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  const holder = account as { free_entries: number | null; id: string } | null;
  let outcome = null;
  try {
    outcome = holder
      ? await switchSignupPass(supabase, {
          account: holder,
          eventId: answer.eventId,
          usePass: "regular",
        })
      : null;
  } catch (error) {
    console.error("Could not switch the ticket to the pass", error);
    await safeEditMessageText(ctx, "Не получилось сменить билет. Попробуйте в афише.");
    return;
  }

  await safeEditMessageText(ctx, passOfferAnswerText(answer, outcome));
}

/**
 * "Can you still come?" after a game moved to another hour. The question is replaced
 * by what came of the answer, so it cannot be answered twice; when the answer could
 * not be saved, the buttons stay for another tap.
 */
async function answerReschedule(ctx: Context, answer: RescheduleAnswer) {
  await safeAnswerCallbackQuery(ctx);

  const notice = findRescheduleNotice(answer.eventId);
  const telegramId = ctx.from?.id;
  if (!notice || !telegramId) return;

  try {
    const outcome = await answerRescheduleNotice(getAdminSupabase(), { answer, telegramId });
    if (!outcome) return;

    console.info("Reschedule answer", {
      accept: answer.accept,
      eventId: answer.eventId,
      outcome: outcome.kind,
      telegramId,
    });
    await safeEditMessageText(ctx, rescheduleAnswerText(notice, outcome));
  } catch (error) {
    console.error("Could not save the answer to the reschedule notice", {
      answer,
      error,
      telegramId,
    });
    await ctx.reply("Не получилось записать ответ. Нажмите кнопку ещё раз чуть позже.");
  }
}

// Menus from before the mini-app take-over may still be sitting in old chats. Answer
// the callback so Telegram stops spinning, then point the player at the app.
bot.on("callback_query", async (ctx) => {
  const passOffer = parsePassOfferCallback(ctx.callbackQuery.data);
  if (passOffer) {
    await answerPassOffer(ctx, passOffer);
    return;
  }

  const reschedule = parseRescheduleCallback(ctx.callbackQuery.data);
  if (reschedule) {
    await answerReschedule(ctx, reschedule);
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await upsertClientBotUser(ctx);
  await sendWelcome(ctx);
});

export const POST = webhookCallback(bot, "std/http", {
  secretToken: process.env.CLIENT_TELEGRAM_WEBHOOK_SECRET,
});
