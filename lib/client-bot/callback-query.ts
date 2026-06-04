import type { InlineKeyboardMarkup } from "grammy/types";

type CallbackQueryContext = {
  answerCallbackQuery: (text?: string) => Promise<unknown>;
};

type EditMessageReplyMarkupContext = {
  editMessageReplyMarkup: () => Promise<unknown>;
};

type EditMessageTextContext = {
  editMessageText: (
    text: string,
    options?: { reply_markup?: InlineKeyboardMarkup },
  ) => Promise<unknown>;
};

function getErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { description: String(error), errorCode: undefined };
  }

  const record = error as { description?: unknown; error?: unknown; error_code?: unknown };
  const nested = record.error && typeof record.error === "object"
    ? record.error as { description?: unknown; error_code?: unknown }
    : null;

  return {
    description: String(record.description ?? nested?.description ?? ""),
    errorCode: record.error_code ?? nested?.error_code,
  };
}

function isExpiredCallbackQueryError(error: unknown) {
  const { description, errorCode } = getErrorDetails(error);
  return errorCode === 400
    && (description.includes("query is too old")
      || description.includes("response timeout expired")
      || description.includes("query ID is invalid"));
}

function isStaleReplyMarkupEditError(error: unknown) {
  const { description, errorCode } = getErrorDetails(error);
  return errorCode === 400
    && (description.includes("message is not modified")
      || description.includes("message to edit not found")
      || description.includes("message can't be edited"));
}

export async function safeAnswerCallbackQuery(ctx: CallbackQueryContext, text?: string) {
  try {
    await ctx.answerCallbackQuery(text);
    return true;
  } catch (error) {
    if (isExpiredCallbackQueryError(error)) {
      console.warn("Ignoring expired Telegram callback query answer", getErrorDetails(error));
      return false;
    }

    throw error;
  }
}

export async function safeRemoveCallbackMessageReplyMarkup(
  ctx: EditMessageReplyMarkupContext,
) {
  try {
    await ctx.editMessageReplyMarkup();
    return true;
  } catch (error) {
    if (isStaleReplyMarkupEditError(error)) {
      console.warn("Ignoring stale Telegram reply markup edit", getErrorDetails(error));
      return false;
    }

    throw error;
  }
}

export async function safeEditMessageText(
  ctx: EditMessageTextContext,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
) {
  try {
    await ctx.editMessageText(
      text,
      replyMarkup ? { reply_markup: replyMarkup } : undefined,
    );
    return true;
  } catch (error) {
    if (isStaleReplyMarkupEditError(error)) {
      console.warn("Ignoring stale Telegram message text edit", getErrorDetails(error));
      return false;
    }

    throw error;
  }
}
