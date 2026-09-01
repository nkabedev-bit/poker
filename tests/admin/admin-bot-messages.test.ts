import { describe, expect, it } from "vitest";
import {
  ADMIN_BOT_COMMANDS_MESSAGE,
  ADMIN_BOT_MENU_COMMANDS,
  buildBirthdayDigestMessage,
} from "@/lib/admin-bot/messages";

describe("admin bot messages", () => {
  it("prints the digest nearest first with a human distance for each date", () => {
    const message = buildBirthdayDigestMessage([
      { date: "05.07", daysUntil: 0, nickname: "Сегодня" },
      { date: "06.07", daysUntil: 1, nickname: "Завтра" },
      { date: "20.07", daysUntil: 15, nickname: "Через две недели" },
    ]);

    expect(message).toContain("05.07 — Сегодня (сегодня)");
    expect(message).toContain("06.07 — Завтра (завтра)");
    expect(message).toContain("20.07 — Через две недели (через 15 дн.)");
  });

  it("says where to look when nobody has a birthday coming up", () => {
    const message = buildBirthdayDigestMessage([]);

    expect(message).toContain("Никого нет");
    expect(message).toContain("анкеты");
  });

  it("names the window it was asked about", () => {
    expect(buildBirthdayDigestMessage([], 7)).toContain("ближайшие 7 дн.");
  });

  it("lists every command the bot answers", () => {
    for (const command of [
      "/start",
      "/info",
      "/birthday",
      "/clearsheet",
      "/resync",
      "/givecolor",
      "/removecolor",
      "/setupmenu",
      "/addadmin",
      "/admins",
      "/removeadmin",
    ]) {
      expect(ADMIN_BOT_COMMANDS_MESSAGE).toContain(command);
    }
  });

  it("offers the new commands in the Telegram menu payload", () => {
    const names = ADMIN_BOT_MENU_COMMANDS.map((item) => item.command);

    expect(names).toContain("birthday");
    expect(names).toContain("info");
    expect(names).toContain("resync");
    // Telegram refuses a command with an empty description.
    expect(ADMIN_BOT_MENU_COMMANDS.every((item) => item.description.length > 0)).toBe(true);
  });
});
