import { describe, expect, it } from "vitest";
import {
  buildSignupBanMessage,
  buildSignupBanUntil,
  isSignupBanned,
  SIGNUP_BAN_DAYS,
} from "@/lib/client-bot/signup-ban";
import { parseBanCommand } from "@/lib/admin-bot/signup-ban-command";

const NOW = new Date("2026-09-21T10:00:00.000Z");

describe("buildSignupBanUntil", () => {
  it("bars the player for a week from the moment the admin says so", () => {
    const until = buildSignupBanUntil(NOW);

    expect(until.getTime() - NOW.getTime()).toBe(SIGNUP_BAN_DAYS * 24 * 60 * 60 * 1000);
  });
});

describe("isSignupBanned", () => {
  it("holds until the last moment and lets go after it", () => {
    const until = "2026-09-28T10:00:00.000Z";

    expect(isSignupBanned(until, new Date("2026-09-27T23:59:00.000Z"))).toBe(true);
    expect(isSignupBanned(until, new Date("2026-09-28T10:00:01.000Z"))).toBe(false);
  });

  it("treats a player with no ban as free to sign up", () => {
    expect(isSignupBanned(null, NOW)).toBe(false);
    expect(isSignupBanned(undefined, NOW)).toBe(false);
  });

  // A date nobody can read must not bar a player by accident.
  it("ignores a date it cannot read", () => {
    expect(isSignupBanned("не дата", NOW)).toBe(false);
  });
});

describe("buildSignupBanMessage", () => {
  it("says why, until when, and that the door is still open", () => {
    const message = buildSignupBanMessage(new Date("2026-09-28T10:00:00.000Z"));

    expect(message).toBe(
      "К сожалению, вы часто отменяли запись на игры. До 28.09 вы не сможете регистрироваться " +
        "на игры, но мы будем рады видеть вас в порядке живой очереди",
    );
  });

  it("reads the date in Moscow, whatever the server thinks", () => {
    // 23:30 UTC is already the next day at the club.
    expect(buildSignupBanMessage("2026-09-28T23:30:00.000Z")).toContain("До 29.09");
  });
});

describe("parseBanCommand", () => {
  it("takes the nickname the admin typed", () => {
    expect(parseBanCommand("/ban Чура")).toBe("Чура");
    expect(parseBanCommand("/unban Чура")).toBe("Чура");
    expect(parseBanCommand("/ban@MajesticBot Чура")).toBe("Чура");
  });

  it("keeps a nickname made of several words", () => {
    expect(parseBanCommand("/ban Mr Fish")).toBe("Mr Fish");
  });

  it("asks for a nickname when none was typed", () => {
    expect(parseBanCommand("/ban")).toBeNull();
    expect(parseBanCommand("/ban   ")).toBeNull();
  });
});
