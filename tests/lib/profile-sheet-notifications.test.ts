import { describe, expect, it } from "vitest";
import { pickProfileSheetRowsOfTelegramId } from "@/lib/google-sheets";
import { CLIENT_BOT_PROFILE_SHEET_HEADERS } from "@/lib/client-bot/registration";

describe("the player's rows in the questionnaire sheet", () => {
  const grid = [
    [...CLIENT_BOT_PROFILE_SHEET_HEADERS],
    ["01.06.2026", "@chura", "874191714", "", "Chura", "", "", "Да", "", "Нет"],
    ["02.06.2026", "@other", "511564749", "", "Other", "", "", "Да", "", "Да"],
    // The paper questionnaires carry no Telegram ID and cannot be told apart by it.
    ["03.06.2026", "", "", "", "Chura", "", "", "Да", "", "Нет"],
    ["04.06.2026", "@chura", " 874191714 ", "", "Chura", "", "", "Да", "", "Нет"],
  ];

  it("finds every questionnaire sent under the Telegram ID, and only those", () => {
    expect(pickProfileSheetRowsOfTelegramId(grid, 874191714)).toEqual([1, 4]);
  });

  it("finds nothing for a player who never sent one", () => {
    expect(pickProfileSheetRowsOfTelegramId(grid, 1)).toEqual([]);
  });

  // The write goes to column J by its position; this is the header it has to be under.
  it("keeps the notifications answer in column J", () => {
    expect(CLIENT_BOT_PROFILE_SHEET_HEADERS[9]).toBe("Согласие на уведомления");
  });
});
