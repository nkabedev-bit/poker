import { describe, expect, it } from "vitest";
import {
  buildClientBotPlayer,
  buildNicknameConfirmationText,
  buildTableSelectionReplyMarkup,
  isRegistrationCodeMatch,
  normalizeClientBotText,
} from "@/lib/client-bot/registration";

describe("client bot registration", () => {
  it("compares registration code after trimming and lowercasing", () => {
    expect(isRegistrationCodeMatch(" River ", "river")).toBe(true);
    expect(isRegistrationCodeMatch("river", "turn")).toBe(false);
    expect(isRegistrationCodeMatch("river", "")).toBe(false);
  });

  it("normalizes user-entered text", () => {
    expect(normalizeClientBotText("  Иван\nПетров  ")).toBe("Иван Петров");
  });

  it("builds an active tournament player from a registered Telegram user", () => {
    const player = buildClientBotPlayer({
      name: "Ace High",
      startingStack: 15000,
      tableNumber: 2,
      telegramId: 12345,
    });

    expect(player).toMatchObject({
      addons: 0,
      bountyCount: 0,
      finishPlace: null,
      name: "Ace High",
      rebuys: 0,
      registeredVia: "client_bot",
      seat: null,
      stack: 15000,
      status: "active",
      table: 2,
      telegramId: 12345,
    });
    expect(player.id).toEqual(expect.any(String));
  });

  it("builds nickname confirmation text before the nickname is locked", () => {
    expect(buildNicknameConfirmationText("Ace High")).toBe(
      "Вы правильно ввели никнейм: Ace High?\nОн закрепится за вами и изменить его впоследствии будет нельзя.",
    );
  });

  it("builds table number buttons from tournament settings", () => {
    expect(buildTableSelectionReplyMarkup(5)).toEqual({
      inline_keyboard: [
        [
          { callback_data: "table_select:1", text: "1" },
          { callback_data: "table_select:2", text: "2" },
          { callback_data: "table_select:3", text: "3" },
        ],
        [
          { callback_data: "table_select:4", text: "4" },
          { callback_data: "table_select:5", text: "5" },
        ],
      ],
    });
  });
});
