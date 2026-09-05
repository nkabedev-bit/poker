import { describe, expect, it } from "vitest";
import { isSameTelegramAccount } from "@/lib/players/same-account";

describe("recognising the player looking at a row", () => {
  it("says yes to their own Telegram id", () => {
    expect(isSameTelegramAccount(555, 555)).toBe(true);
  });

  it("says no to somebody else's", () => {
    expect(isSameTelegramAccount(555, 777)).toBe(false);
  });

  // The whole reason this exists: two web players both carry no Telegram id, and
  // comparing those directly made every one of them read as the viewer.
  it("never matches two players who have no Telegram between them", () => {
    expect(isSameTelegramAccount(null, null)).toBe(false);
    expect(isSameTelegramAccount(undefined, undefined)).toBe(false);
    expect(isSameTelegramAccount(null, undefined)).toBe(false);
  });

  it("says no when only one side has an id", () => {
    expect(isSameTelegramAccount(null, 555)).toBe(false);
    expect(isSameTelegramAccount(555, null)).toBe(false);
  });

  // A roster row written by hand can carry a zero rather than nothing at all.
  it("treats a zero as no id", () => {
    expect(isSameTelegramAccount(0, 0)).toBe(false);
  });
});
