import { Bot, webhookCallback, type Context } from "grammy";
import { createClient } from "@supabase/supabase-js";
import {
  buildProfileNicknameConfirmationText,
  buildClientBotPlayer,
  buildNicknameConfirmationText,
  buildQuestionnaireStepReplyMarkup,
  CLIENT_BOT_PROFILE_INTRO_TEXT,
  buildTableSelectionReplyMarkup,
  CLIENT_BOT_PROFILE_STEPS,
  type ClientBotProfileAnswers,
  type ClientBotProfileStepId,
  isRegistrationCodeMatch,
  normalizeClientBotText,
} from "@/lib/client-bot/registration";
import {
  type CurrentTournamentContext,
  loadCurrentTournamentContext,
  saveTournamentExtrasFromContext,
} from "@/lib/client-bot/server";
import { appendClientBotProfileRow } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ClientBotUser = {
  chat_id: number;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  pending_display_name: string | null;
  pending_profile_answers: Partial<ClientBotProfileAnswers> | null;
  profile_submitted_at: string | null;
  registered_player_id: string | null;
  state:
    | "idle"
    | "awaiting_profile_full_name"
    | "awaiting_profile_nickname"
    | "awaiting_profile_phone"
    | "awaiting_profile_birth_date"
    | "awaiting_profile_rating_consent"
    | "awaiting_profile_discovery_source"
    | "awaiting_profile_notifications_consent"
    | "awaiting_profile_agreement"
    | "awaiting_profile_nickname_confirmation"
    | "awaiting_profile_nickname_fix"
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

const profileNicknameConfirmationReplyMarkup = {
  inline_keyboard: [
    [
      { callback_data: "profile_nickname_confirm:yes", text: "Да" },
      { callback_data: "profile_nickname_confirm:no", text: "Нет" },
    ],
  ],
};

const profileStepStates: Record<ClientBotProfileStepId, ClientBotUser["state"]> = {
  agreementAccepted: "awaiting_profile_agreement",
  birthDate: "awaiting_profile_birth_date",
  discoverySource: "awaiting_profile_discovery_source",
  fullName: "awaiting_profile_full_name",
  nickname: "awaiting_profile_nickname",
  notificationsConsent: "awaiting_profile_notifications_consent",
  phone: "awaiting_profile_phone",
  ratingConsent: "awaiting_profile_rating_consent",
};

const stateProfileSteps = new Map<ClientBotUser["state"], ClientBotProfileStepId>(
  Object.entries(profileStepStates).map(([stepId, state]) => [
    state,
    stepId as ClientBotProfileStepId,
  ]),
);

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
    .select("chat_id, display_name, first_name, last_name, pending_display_name, pending_profile_answers, profile_submitted_at, registered_player_id, state, telegram_id, username")
    .eq("telegram_id", telegramId)
    .single();

  return {
    supabase,
    user: data as ClientBotUser,
  };
}

function getProfileStep(stepId: ClientBotProfileStepId) {
  return CLIENT_BOT_PROFILE_STEPS.find((step) => step.id === stepId);
}

function getNextProfileStepId(stepId: ClientBotProfileStepId) {
  const index = CLIENT_BOT_PROFILE_STEPS.findIndex((step) => step.id === stepId);
  return CLIENT_BOT_PROFILE_STEPS[index + 1]?.id;
}

function getProfileStepIdByState(state: ClientBotUser["state"]) {
  return stateProfileSteps.get(state);
}

function getProfileDraft(user: ClientBotUser): Partial<ClientBotProfileAnswers> {
  return user.pending_profile_answers ?? {};
}

function isCompleteProfileAnswers(
  value: Partial<ClientBotProfileAnswers>,
): value is ClientBotProfileAnswers {
  return typeof value.fullName === "string"
    && typeof value.nickname === "string"
    && typeof value.phone === "string"
    && typeof value.birthDate === "string"
    && typeof value.discoverySource === "string"
    && typeof value.ratingConsent === "boolean"
    && typeof value.notificationsConsent === "boolean"
    && value.agreementAccepted === true;
}

async function askProfileStep({
  ctx,
  result,
  stepId,
}: {
  ctx: Context;
  result: NonNullable<Awaited<ReturnType<typeof upsertClientBotUser>>>;
  stepId: ClientBotProfileStepId;
}) {
  const step = getProfileStep(stepId);
  if (!step) return;

  await result.supabase
    .from("client_bot_users")
    .update({ state: profileStepStates[stepId] })
    .eq("telegram_id", result.user.telegram_id);

  await ctx.reply(step.question, {
    reply_markup: buildQuestionnaireStepReplyMarkup(stepId) ?? { remove_keyboard: true },
  });
}

async function startProfileQuestionnaire(
  ctx: Context,
  result: NonNullable<Awaited<ReturnType<typeof upsertClientBotUser>>>,
) {
  await result.supabase
    .from("client_bot_users")
    .update({
      pending_profile_answers: {},
      state: profileStepStates.fullName,
    })
    .eq("telegram_id", result.user.telegram_id);

  await ctx.reply(CLIENT_BOT_PROFILE_INTRO_TEXT, {
    reply_markup: { remove_keyboard: true },
  });
  await ctx.reply(CLIENT_BOT_PROFILE_STEPS[0].question, {
    reply_markup: { remove_keyboard: true },
  });
}

async function promptCurrentProfileQuestion(
  ctx: Context,
  result: NonNullable<Awaited<ReturnType<typeof upsertClientBotUser>>>,
) {
  if (result.user.profile_submitted_at) return true;

  const stepId = getProfileStepIdByState(result.user.state);
  if (stepId) {
    await askProfileStep({ ctx, result, stepId });
    return false;
  }

  if (result.user.state === "awaiting_profile_nickname_confirmation") {
    const nickname = getProfileDraft(result.user).nickname;
    if (nickname) {
      await ctx.reply(buildProfileNicknameConfirmationText(nickname), {
        reply_markup: profileNicknameConfirmationReplyMarkup,
      });
      return false;
    }
  }

  if (result.user.state === "awaiting_profile_nickname_fix") {
    await ctx.reply("Введите никнейм еще раз.", {
      reply_markup: { remove_keyboard: true },
    });
    return false;
  }

  await startProfileQuestionnaire(ctx, result);
  return false;
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

  if (!(await promptCurrentProfileQuestion(ctx, result))) return;

  await ctx.reply("Выберите действие.", { reply_markup: menuReplyMarkup });
});

bot.hears("Регистрация", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  if (!(await promptCurrentProfileQuestion(ctx, result))) return;

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

  if (!(await promptCurrentProfileQuestion(ctx, result))) return;

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

  if (!(await promptCurrentProfileQuestion(ctx, result))) return;

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
  const profileStepId = getProfileStepIdByState(result.user.state);
  if (profileStepId) {
    const step = getProfileStep(profileStepId);
    if (step?.type !== "text") {
      await ctx.reply("Выберите вариант кнопкой под предыдущим сообщением.", {
        reply_markup: buildQuestionnaireStepReplyMarkup(profileStepId),
      });
      return;
    }

    const value = normalizeClientBotText(text);
    if (!value) {
      await ctx.reply("Введите ответ текстом.");
      return;
    }

    const answers = { ...getProfileDraft(result.user), [profileStepId]: value };
    const nextStepId = getNextProfileStepId(profileStepId);

    await result.supabase
      .from("client_bot_users")
      .update({ pending_profile_answers: answers })
      .eq("telegram_id", result.user.telegram_id);

    if (nextStepId) {
      await askProfileStep({ ctx, result, stepId: nextStepId });
      return;
    }

    await result.supabase
      .from("client_bot_users")
      .update({ state: "awaiting_profile_nickname_confirmation" })
      .eq("telegram_id", result.user.telegram_id);

    await ctx.reply(buildProfileNicknameConfirmationText(answers.nickname ?? ""), {
      reply_markup: profileNicknameConfirmationReplyMarkup,
    });
    return;
  }

  if (result.user.state === "awaiting_profile_nickname_fix") {
    const nickname = normalizeClientBotText(text);
    if (!nickname) {
      await ctx.reply("Введите никнейм текстом.");
      return;
    }

    const answers = { ...getProfileDraft(result.user), nickname };
    await result.supabase
      .from("client_bot_users")
      .update({
        pending_profile_answers: answers,
        state: "awaiting_profile_nickname_confirmation",
      })
      .eq("telegram_id", result.user.telegram_id);

    await ctx.reply(buildProfileNicknameConfirmationText(nickname), {
      reply_markup: profileNicknameConfirmationReplyMarkup,
    });
    return;
  }

  if (result.user.state === "awaiting_profile_nickname_confirmation") {
    const nickname = getProfileDraft(result.user).nickname;
    await ctx.reply(
      nickname
        ? "Подтвердите никнейм кнопками под предыдущим сообщением."
        : "Введите никнейм еще раз.",
      {
        reply_markup: nickname
          ? profileNicknameConfirmationReplyMarkup
          : { remove_keyboard: true },
      },
    );
    return;
  }

  if (!result.user.profile_submitted_at) {
    await startProfileQuestionnaire(ctx, result);
    return;
  }

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

bot.callbackQuery(/^profile_answer:(\w+):(yes|no)$/, async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  const stepId = ctx.match[1] as ClientBotProfileStepId;
  const answer = ctx.match[2] === "yes";
  const step = getProfileStep(stepId);

  if (!step || result.user.state !== profileStepStates[stepId]) {
    await ctx.answerCallbackQuery();
    await promptCurrentProfileQuestion(ctx, result);
    return;
  }

  if (step.type === "text") {
    await ctx.answerCallbackQuery();
    await ctx.reply("Введите ответ текстом.");
    return;
  }

  const answers = { ...getProfileDraft(result.user), [stepId]: answer };
  const nextStepId = getNextProfileStepId(stepId);

  await ctx.answerCallbackQuery();
  await result.supabase
    .from("client_bot_users")
    .update({ pending_profile_answers: answers })
    .eq("telegram_id", result.user.telegram_id);

  if (nextStepId) {
    await askProfileStep({ ctx, result, stepId: nextStepId });
    return;
  }

  await result.supabase
    .from("client_bot_users")
    .update({ state: "awaiting_profile_nickname_confirmation" })
    .eq("telegram_id", result.user.telegram_id);

  await ctx.reply(buildProfileNicknameConfirmationText(answers.nickname ?? ""), {
    reply_markup: profileNicknameConfirmationReplyMarkup,
  });
});

bot.callbackQuery("profile_nickname_confirm:no", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  await result.supabase
    .from("client_bot_users")
    .update({ state: "awaiting_profile_nickname_fix" })
    .eq("telegram_id", result.user.telegram_id);

  await ctx.answerCallbackQuery();
  await ctx.reply("Введите никнейм еще раз.", {
    reply_markup: { remove_keyboard: true },
  });
});

bot.callbackQuery("profile_nickname_confirm:yes", async (ctx) => {
  const result = await upsertClientBotUser(ctx);
  if (!result) return;

  const answers = getProfileDraft(result.user);
  if (!isCompleteProfileAnswers(answers)) {
    await result.supabase
      .from("client_bot_users")
      .update({ state: profileStepStates.fullName })
      .eq("telegram_id", result.user.telegram_id);

    await ctx.answerCallbackQuery();
    await ctx.reply("Анкета заполнена не полностью. Начнем заново.");
    await startProfileQuestionnaire(ctx, result);
    return;
  }

  const submittedAt = new Date();
  await appendClientBotProfileRow({
    answers,
    submittedAt,
    telegramId: result.user.telegram_id,
    username: result.user.username,
  });

  await result.supabase
    .from("client_bot_users")
    .update({
      display_name: answers.nickname,
      pending_display_name: null,
      pending_profile_answers: answers,
      profile_submitted_at: submittedAt.toISOString(),
      state: "idle",
    })
    .eq("telegram_id", result.user.telegram_id);

  await ctx.answerCallbackQuery();
  await ctx.reply("Анкета сохранена.", { reply_markup: menuReplyMarkup });
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
