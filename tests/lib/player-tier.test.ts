import { describe, expect, it } from "vitest";
import { getTierFromGames, readTierLabel, resolvePlayerTier } from "@/lib/players/tier";

describe("getTierFromGames", () => {
  it("moves a player up as they keep turning up", () => {
    expect(getTierFromGames(4)).toBeNull();
    expect(getTierFromGames(5)).toBe("member");
    expect(getTierFromGames(19)).toBe("member");
    expect(getTierFromGames(20)).toBe("core");
    expect(getTierFromGames(49)).toBe("core");
    expect(getTierFromGames(50)).toBe("legend");
    expect(getTierFromGames(300)).toBe("legend");
  });

  // Champion is the club's to give, not something a counter reaches.
  it("never crowns a champion by itself", () => {
    expect(getTierFromGames(1000)).toBe("legend");
  });

  it("survives a missing or broken count", () => {
    expect(getTierFromGames(Number.NaN)).toBeNull();
    expect(getTierFromGames(-5)).toBeNull();
  });
});

describe("readTierLabel", () => {
  it("reads the tier an admin typed, in either language", () => {
    expect(readTierLabel("champion")).toBe("champion");
    expect(readTierLabel("Чемпион")).toBe("champion");
    expect(readTierLabel(" LEGEND ")).toBe("legend");
    expect(readTierLabel("core")).toBe("core");
  });

  it("leaves other labels alone", () => {
    expect(readTierLabel("дилер")).toBeNull();
    expect(readTierLabel("именинник")).toBeNull();
    expect(readTierLabel(null)).toBeNull();
  });
});

describe("resolvePlayerTier", () => {
  it("counts the games when nobody said otherwise", () => {
    expect(resolvePlayerTier({ games: 22 })).toBe("core");
  });

  // The label is how a champion is crowned and how an exception is made.
  it("lets a hand-typed tier win over the count", () => {
    expect(resolvePlayerTier({ games: 60, label: "champion" })).toBe("champion");
    expect(resolvePlayerTier({ games: 1, label: "legend" })).toBe("legend");
  });

  it("ignores a label that names something else", () => {
    expect(resolvePlayerTier({ games: 25, label: "дилер" })).toBe("core");
  });

  it("shows nothing for a newcomer", () => {
    expect(resolvePlayerTier({ games: 2 })).toBeNull();
    expect(resolvePlayerTier({})).toBeNull();
  });
});
