import { describe, expect, it } from "vitest";
import {
  describeMysteryPrize,
  getMysteryPrizeChips,
  getMysteryPrizePass,
  getMysteryPrizePoints,
  parseMysteryPrize,
  parseMysteryPrizes,
} from "@/lib/mystery/prizes";

describe("parseMysteryPrize", () => {
  it("accepts the cards the deck actually holds", () => {
    expect(parseMysteryPrize({ amount: 3, kind: "bigBlinds" })).toEqual({ amount: 3, kind: "bigBlinds" });
    expect(parseMysteryPrize({ amount: 20, kind: "points" })).toEqual({ amount: 20, kind: "points" });
    expect(parseMysteryPrize({ kind: "pass", pass: "vip" })).toEqual({ kind: "pass", pass: "vip" });
    expect(parseMysteryPrize({ kind: "other" })).toEqual({ kind: "other" });
  });

  // The prize moves chips and rating points, so an unknown value is no prize at all.
  it("refuses a value that is not printed on a card", () => {
    expect(parseMysteryPrize({ amount: 4, kind: "bigBlinds" })).toBeNull();
    expect(parseMysteryPrize({ amount: 999, kind: "points" })).toBeNull();
    expect(parseMysteryPrize({ kind: "pass", pass: "gold" })).toBeNull();
    expect(parseMysteryPrize({ kind: "chips" })).toBeNull();
    expect(parseMysteryPrize(null)).toBeNull();
  });
});

describe("parseMysteryPrizes", () => {
  it("keeps only the killers who took part in this knockout", () => {
    const entries = parseMysteryPrizes(
      [
        { killerId: "a", prize: { amount: 40, kind: "points" } },
        { killerId: "ghost", prize: { amount: 40, kind: "points" } },
      ],
      ["a", "b"],
    );

    expect(entries).toEqual([{ killerId: "a", prize: { amount: 40, kind: "points" } }]);
  });

  it("gives one killer one card, whatever the client sends twice", () => {
    const entries = parseMysteryPrizes(
      [
        { killerId: "a", prize: { amount: 20, kind: "points" } },
        { killerId: "a", prize: { amount: 60, kind: "points" } },
      ],
      ["a"],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].prize).toEqual({ amount: 20, kind: "points" });
  });
});

describe("what a card pays", () => {
  it("counts big blinds at the level in play", () => {
    expect(getMysteryPrizeChips({ amount: 2, kind: "bigBlinds" }, 400)).toBe(800);
    expect(getMysteryPrizeChips({ amount: 20, kind: "points" }, 400)).toBe(0);
  });

  it("keeps points and passes apart from chips", () => {
    expect(getMysteryPrizePoints({ amount: 60, kind: "points" })).toBe(60);
    expect(getMysteryPrizePoints({ kind: "other" })).toBe(0);
    expect(getMysteryPrizePass({ kind: "pass", pass: "regular" })).toBe("regular");
    expect(getMysteryPrizePass({ amount: 1, kind: "bigBlinds" })).toBeNull();
  });

  it("says out loud what the dealer drew", () => {
    expect(describeMysteryPrize({ amount: 1, kind: "bigBlinds" })).toBe("1 ББ в стек");
    expect(describeMysteryPrize({ amount: 40, kind: "points" })).toBe("40 PTS");
    expect(describeMysteryPrize({ kind: "pass", pass: "vip" })).toBe("VIP проходка");
    expect(describeMysteryPrize({ kind: "other" })).toBe("Другое");
  });
});
