import { describe, expect, it, vi } from "vitest";
import {
  safeAnswerCallbackQuery,
  safeEditMessageText,
  safeRemoveCallbackMessageReplyMarkup,
} from "@/lib/client-bot/callback-query";

describe("client bot callback query helpers", () => {
  it("does not throw when Telegram says the callback query is too old", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = {
      answerCallbackQuery: vi.fn().mockRejectedValue(
        Object.assign(new Error("Call to 'answerCallbackQuery' failed"), {
          error_code: 400,
          description: "Bad Request: query is too old and response timeout expired or query ID is invalid",
        }),
      ),
    };

    await expect(safeAnswerCallbackQuery(ctx)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "Ignoring expired Telegram callback query answer",
      expect.objectContaining({ description: expect.stringContaining("query is too old") }),
    );

    warn.mockRestore();
  });

  it("removes inline buttons from the callback message", async () => {
    const ctx = {
      editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
    };

    await expect(safeRemoveCallbackMessageReplyMarkup(ctx)).resolves.toBe(true);
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith();
  });

  it("does not throw when Telegram cannot edit stale message buttons", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = {
      editMessageReplyMarkup: vi.fn().mockRejectedValue(
        Object.assign(new Error("Call to 'editMessageReplyMarkup' failed"), {
          error_code: 400,
          description: "Bad Request: message is not modified",
        }),
      ),
    };

    await expect(safeRemoveCallbackMessageReplyMarkup(ctx)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "Ignoring stale Telegram reply markup edit",
      expect.objectContaining({ description: expect.stringContaining("message is not modified") }),
    );

    warn.mockRestore();
  });

  it("edits callback message text with inline controls", async () => {
    const ctx = {
      editMessageText: vi.fn().mockResolvedValue(true),
    };
    const replyMarkup = {
      inline_keyboard: [[{ callback_data: "client_menu:main", text: "Главное меню" }]],
    };

    await expect(
      safeEditMessageText(ctx, "Выберите действие.", replyMarkup),
    ).resolves.toBe(true);

    expect(ctx.editMessageText).toHaveBeenCalledWith("Выберите действие.", {
      reply_markup: replyMarkup,
    });
  });

  it("does not throw when Telegram cannot edit stale message text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = {
      editMessageText: vi.fn().mockRejectedValue(
        Object.assign(new Error("Call to 'editMessageText' failed"), {
          error_code: 400,
          description: "Bad Request: message can't be edited",
        }),
      ),
    };

    await expect(safeEditMessageText(ctx, "Выберите действие.")).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "Ignoring stale Telegram message text edit",
      expect.objectContaining({ description: expect.stringContaining("can't be edited") }),
    );

    warn.mockRestore();
  });
});
