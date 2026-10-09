import { describe, expect, it } from "vitest";
import { canOpenScreen, parseRoleWord, readRole } from "@/lib/tma/roles";

describe("readRole", () => {
  it("reads a floor and a dealer as stored", () => {
    expect(readRole(7, "floor")).toBe("floor");
    expect(readRole(7, "dealer")).toBe("dealer");
  });

  // An unreadable value must never widen access.
  it("counts anything unknown as a dealer", () => {
    expect(readRole(7, null)).toBe("dealer");
    expect(readRole(7, "admin")).toBe("dealer");
  });

  it("keeps both access managers floors", () => {
    expect(readRole(511564749, "dealer")).toBe("floor");
    expect(readRole(384428007, null)).toBe("floor");
  });
});

describe("canOpenScreen", () => {
  it("opens the room, the sign-ups and the knockouts to a dealer", () => {
    expect(canOpenScreen("dealer", "/tma/players")).toBe(true);
    expect(canOpenScreen("dealer", "/tma/signups")).toBe(true);
    expect(canOpenScreen("dealer", "/tma/eliminations")).toBe(true);
  });

  it("closes the cash desk, the tournament and «Ещё» to a dealer", () => {
    for (const screen of ["/tma/cards", "/tma/cards/debts", "/tma/control", "/tma/events", "/tma/bot"]) {
      expect(canOpenScreen("dealer", screen)).toBe(false);
    }
  });

  it("does not take a look-alike path for a dealer's screen", () => {
    expect(canOpenScreen("dealer", "/tma/players-export")).toBe(false);
  });

  it("opens everything to a floor", () => {
    expect(canOpenScreen("floor", "/tma/cards/debts")).toBe(true);
  });
});

describe("parseRoleWord", () => {
  it("accepts the role in Russian and English, any case", () => {
    expect(parseRoleWord("Флор")).toBe("floor");
    expect(parseRoleWord("dealer")).toBe("dealer");
    expect(parseRoleWord("ДИЛЕР")).toBe("dealer");
  });

  it("refuses anything else", () => {
    expect(parseRoleWord("админ")).toBeNull();
    expect(parseRoleWord(undefined)).toBeNull();
  });
});
