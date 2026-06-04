import { Bot, webhookCallback, type Context } from "grammy";
import { createClient } from "@supabase/supabase-js";
import {
  buildClientBotPlayer,
  buildNicknameConfirmationText,
  buildTableSelectionReplyMarkup,
  isRegistrationCodeMatch,
  normalizeClientBotText,
} from "@/lib/client-bot/registration";
import {
  type CurrentTournamentContext,
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
  pending_display_name: string | null;
  registered_player_id: string | null;
  state:
    | "idle"
    | "awaiting_registration_code"
    | "awaiting_registration_name"
    | "awaiting_nickname_confirmation"
    | "awaiting_registration_table";
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

const nicknameConfirmationReplyMarkup = {
  inline_keyboard: [
    [
      { callback_data: "nickname_confirm:yes", text: "Да" },
      { callback_data: "nickname_confirm:no", text: "Нет" },
    ],
  ],
};

function getEffectiveTablesCount(context: CurrentTournamentContext) {
  return Math.max(1, Math.floor(context.extras.settings.tablesCount));
}

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
    .select("chat_id, display_name, first_name, last_name, pending_display_name, registered_player_id, state, telegram_id, username")
    .eq("telegram_id", telegramId)
    .single();

  return {
    supabase,
    user: data as ClientBotUser,
  };
}

async function registerUserWithName({
  context,
  ctx,
  name,
  result,
  tableNumber,
}: {
  context: CurrentTournamentContext;
  ctx: Context;
  name: string;
  result: NonNullable<Awaited<ReturnType<typeof upsertClientBotUser>>>;
  tableNumber: number;
}) {
  const existingPlayer = context.extras.players.find(
    (player) => player.telegramId === result.user.telegram_id,
  );

  if (existingPlayer) {
    await result.supabase
      .from("client_bot_users")
      .update({
        display_name: result.user.display_name ?? existingPlayer.name,
        pending_display_name: null,
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
    tableNumber,
    telegramId: result.user.telegram_id,
  });

  await saveTournamentExtrasFromContext(result.supabase, context, {
    players: [...context.extras.players, player],
  });

  await result.supabase
    .from("client_bot_users")
    .update({
      display_name: result.user.display_name ?? player.name,
      pending_display_name: null,
      registered_at: new Date().toISOString(),
      registered_player_id: player.id,
      state: "idle",
    })
    .eq("telegram_id", result.user.telegram_id);

  await ctx.reply(`Вы зарегистрированы как ${player.name}.`, {
    reply_markup: menuReplyMarkup,
  });
}

async function askForTableNumber({
  context,
  ctx,
  displayName,
  result,
}: {
  context: CurrentTournamentContext;
  ctx: Context;
  displayName: string;
  result: NonNullable<Awaited<ReturnType<typeof upsertClientBotUser>>>;
}) {
  const existingPlayer = context.extras.players.find(
    (player) => player.telegramId === result.user.telegram_id,
  );

  if (existingPlayer) {
    await result.supabase
      .from("client_bot_users")
      .update({
        display_name: result.user.display_name ?? existingPlayer.name,
        pending_display_name: null,
        registered_player_id: existingPlayer.id,
        state: "idle",
      })
      .eq("telegram_id", result.user.telegram_id);

    await ctx.reply("Вы уже зарегистрированы.", { reply_markup: menuReplyMarkup });
    return;
  }

  await result.supabase
    .from("client_bot_users")
    .update({
      display_name: displayName,
      pending_display_name: null,
      state: "awaiting_registration_table",
    })
    .eq("telegram_id", result.user.telegram_id);

  await ctx.reply("Выберите номер стола.", {
    reply_markup: buildTableSelectionReplyMarkup(getEffectiveTablesCount(context)),
  });
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

    if (result.user.display_name) {
      await askForTableNumber({
        context,
        ctx,
        displayName: result.user.display_name,
        result,
      });
      return;
    }

    await result.supabase
      .from("client_bot_users")
      .update({ pending_display_name: null, state: "awaiting_registration_name" })
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

    await result.supabase
      .from("client_bot_users")
      .update({
        pending_display_name: name,
        state: "awaiting_nickname_confirmation",
      })
      .eq("telegram_id", result.user.telegram_id);

    await ctx.reply(buildNicknameConfirmationText(name), {
      reply_markup: nicknameConfirmationReplyMarkup,
    });
    return;
  }

  if (result.user.state === "awaiting_nickname_confirmation") {
    await ctx.reply("Подтвердите никнейм кнопками под предыдущим сообщением.", {
      reply_markup: nicknameConfirmationReplyMarkup,
    });
    return;
  }

  if (result.user.state === "awaiting_registration_table") {
    await ctx.reply("Выберите номер стола кнопкой под предыдущим сообщением.", {
      reply_markup: buildTableSelectionReplyMarkup(getEffectiveTablesCount(context)),
    });
    return;
  }

  await ctx.reply("Выберите действие в меню.", { reply_markup: menuReplyMarkup });
});

bot.callbackQuery("nickname_confirm:no", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  await result.supabase
    .from("client_bot_users")
    .update({
      pending_display_name: null,
      state: "awaiting_registration_name",
    })
    .eq("telegram_id", result.user.telegram_id);

  await ctx.answerCallbackQuery();
  await ctx.reply("Введите никнейм еще раз.");
});

bot.callbackQuery("nickname_confirm:yes", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  const context = await loadCurrentTournamentContext(result.supabase);
  const name = result.user.pending_display_name;

  if (!context || !name) {
    await result.supabase
      .from("client_bot_users")
      .update({
        pending_display_name: null,
        state: "awaiting_registration_name",
      })
      .eq("telegram_id", result.user.telegram_id);

    await ctx.answerCallbackQuery();
    await ctx.reply("Введите никнейм еще раз.");
    return;
  }

  await ctx.answerCallbackQuery();
  await askForTableNumber({
    context,
    ctx,
    displayName: name,
    result,
  });
});

bot.callbackQuery(/^table_select:(\d+)$/, async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  const context = await loadCurrentTournamentContext(result.supabase);
  const tableNumber = Number(ctx.match[1]);
  const tablesCount = context ? getEffectiveTablesCount(context) : 0;

  if (!context || result.user.state !== "awaiting_registration_table") {
    await ctx.answerCallbackQuery();
    await ctx.reply("Начните регистрацию заново.", { reply_markup: menuReplyMarkup });
    return;
  }

  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > tablesCount) {
    await ctx.answerCallbackQuery("Неверный номер стола");
    await ctx.reply("Выберите номер стола из списка.", {
      reply_markup: buildTableSelectionReplyMarkup(tablesCount),
    });
    return;
  }

  const name = result.user.display_name;
  if (!name) {
    await result.supabase
      .from("client_bot_users")
      .update({ state: "awaiting_registration_name" })
      .eq("telegram_id", result.user.telegram_id);

    await ctx.answerCallbackQuery();
    await ctx.reply("Введите никнейм еще раз.");
    return;
  }

  await ctx.answerCallbackQuery();
  await registerUserWithName({
    context,
    ctx,
    name,
    result,
    tableNumber,
  });
});

export const POST = webhookCallback(bot, "std/http", {
  secretToken: process.env.CLIENT_TELEGRAM_WEBHOOK_SECRET,
});
