import { describe, expect, it } from "vitest";
import {
  buildClientBotPlayer,
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
      table: null,
      telegramId: 12345,
    });
    expect(player.id).toEqual(expect.any(String));
  });
});
