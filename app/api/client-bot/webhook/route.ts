import { Bot, webhookCallback, type Context } from "grammy";
import { createClient } from "@supabase/supabase-js";
import {
  buildClientBotPlayer,
  isRegistrationCodeMatch,
  normalizeClientBotText,
} from "@/lib/client-bot/registration";
import {
  loadCurrentTournamentContext,
  saveTournamentExtrasFromContext,
} from "@/lib/client-bot/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ClientBotUser = {
  chat_id: number;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  registered_player_id: string | null;
  state: "idle" | "awaiting_registration_code" | "awaiting_registration_name";
  telegram_id: number;
  username: string | null;
};

const menuReplyMarkup = {
  keyboard: [
    [{ text: "Регистрация" }],
    [{ text: "Рейтинговая таблица" }, { text: "Расписание турниров" }],
  ],
  resize_keyboard: true,
};

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
  if (!telegramId || !chatId) return null;

  const supabase = getAdminSupabase();
  const from = ctx.from;

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

  const { data } = await supabase
    .from("client_bot_users")
    .select("chat_id, display_name, first_name, last_name, registered_player_id, state, telegram_id, username")
    .eq("telegram_id", telegramId)
    .single();

  return {
    supabase,
    user: data as ClientBotUser,
  };
}

const bot = new Bot(getBotToken());

bot.command("start", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  await ctx.reply("Выберите действие.", { reply_markup: menuReplyMarkup });
});

bot.hears("Регистрация", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  await result.supabase
    .from("client_bot_users")
    .update({ state: "awaiting_registration_code" })
    .eq("telegram_id", result.user.telegram_id);

  await ctx.reply("Введите кодовое слово для регистрации.", {
    reply_markup: { remove_keyboard: true },
  });
});

bot.hears("Рейтинговая таблица", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  const context = await loadCurrentTournamentContext(result.supabase);
  const ratingUrl = context?.extras.clientBot.ratingUrl.trim();

  await ctx.reply(
    ratingUrl
      ? `Рейтинговая таблица:\n${ratingUrl}`
      : "Ссылка на рейтинговую таблицу пока не добавлена.",
    { reply_markup: menuReplyMarkup },
  );
});

bot.hears("Расписание турниров", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  const context = await loadCurrentTournamentContext(result.supabase);
  const scheduleText = context?.extras.clientBot.scheduleText.trim();

  await ctx.reply(scheduleText || "Расписание ближайших турниров пока не добавлено.", {
    reply_markup: menuReplyMarkup,
  });
});

bot.on("message:text", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  const text = ctx.message.text;
  const context = await loadCurrentTournamentContext(result.supabase);
  if (!context) {
    await ctx.reply("Турнир пока не настроен.", { reply_markup: menuReplyMarkup });
    return;
  }

  if (result.user.state === "awaiting_registration_code") {
    if (!isRegistrationCodeMatch(text, context.extras.clientBot.registrationCode)) {
      await ctx.reply("Кодовое слово не подошло. Проверьте код и отправьте его еще раз.");
      return;
    }

    await result.supabase
      .from("client_bot_users")
      .update({ state: "awaiting_registration_name" })
      .eq("telegram_id", result.user.telegram_id);

    await ctx.reply("Код принят. Введите ваш никнейм для списка участников.");
    return;
  }

  if (result.user.state === "awaiting_registration_name") {
    const name = normalizeClientBotText(text);
    if (!name) {
      await ctx.reply("Введите никнейм текстом.");
      return;
    }

    const existingPlayer = context.extras.players.find(
      (player) => player.telegramId === result.user.telegram_id,
    );

    if (existingPlayer) {
      await result.supabase
        .from("client_bot_users")
        .update({
          display_name: existingPlayer.name,
          registered_player_id: existingPlayer.id,
          state: "idle",
        })
        .eq("telegram_id", result.user.telegram_id);

      await ctx.reply("Вы уже зарегистрированы.", { reply_markup: menuReplyMarkup });
      return;
    }

    const player = buildClientBotPlayer({
      name,
      startingStack: context.tournament.starting_stack,
      telegramId: result.user.telegram_id,
    });

    await saveTournamentExtrasFromContext(result.supabase, context, {
      players: [...context.extras.players, player],
    });

    await result.supabase
      .from("client_bot_users")
      .update({
        display_name: player.name,
        registered_at: new Date().toISOString(),
        registered_player_id: player.id,
        state: "idle",
      })
      .eq("telegram_id", result.user.telegram_id);

    await ctx.reply(`Вы зарегистрированы как ${player.name}.`, {
      reply_markup: menuReplyMarkup,
    });
    return;
  }

  await ctx.reply("Выберите действие в меню.", { reply_markup: menuReplyMarkup });
});

export const POST = webhookCallback(bot, "std/http", {
  secretToken: process.env.CLIENT_TELEGRAM_WEBHOOK_SECRET,
});
