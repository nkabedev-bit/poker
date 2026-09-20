import { describe, expect, it } from "vitest";
import {
  describeMysteryPrize,
  getMysteryPrizeChips,
  getMysteryPrizePasses,
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
    expect(getMysteryPrizePasses({ kind: "pass", pass: "regular" })).toEqual(["regular"]);
    expect(getMysteryPrizePasses({ amount: 1, kind: "bigBlinds" })).toEqual([]);
  });

  it("says out loud what the dealer drew", () => {
    expect(describeMysteryPrize({ amount: 1, kind: "bigBlinds" })).toBe("1 ББ в стек");
    expect(describeMysteryPrize({ amount: 40, kind: "points" })).toBe("40 PTS");
    expect(describeMysteryPrize({ kind: "pass", pass: "vip" })).toBe("VIP проходка");
    expect(describeMysteryPrize({ kind: "other" })).toBe("Другое");
  });
});

describe("the Joker", () => {
  const joker = {
    kind: "joker" as const,
    prizes: [
      { amount: 2, kind: "bigBlinds" as const },
      { amount: 40, kind: "points" as const },
    ],
  };

  it("reads a Joker that pays two ordinary cards", () => {
    expect(parseMysteryPrize(joker)).toEqual(joker);
  });

  // A Joker inside a Joker would let one knockout pay without limit.
  it("refuses a Joker nested inside a Joker", () => {
    expect(
      parseMysteryPrize({
        kind: "joker",
        prizes: [joker, { amount: 20, kind: "points" }],
      }),
    ).toBeNull();
  });

  it("refuses a Joker that does not pay exactly two cards", () => {
    expect(parseMysteryPrize({ kind: "joker", prizes: [{ kind: "other" }] })).toBeNull();
    expect(
      parseMysteryPrize({
        kind: "joker",
        prizes: [{ kind: "other" }, { kind: "other" }, { kind: "other" }],
      }),
    ).toBeNull();
    expect(parseMysteryPrize({ kind: "joker" })).toBeNull();
  });

  // One bad half must not pay out the good one: the card is refused whole.
  it("refuses a Joker whose half is not on any card", () => {
    expect(
      parseMysteryPrize({
        kind: "joker",
        prizes: [{ amount: 2, kind: "bigBlinds" }, { amount: 999, kind: "points" }],
      }),
    ).toBeNull();
  });

  it("pays the chips and the points of both halves", () => {
    expect(getMysteryPrizeChips(joker, 400)).toBe(800);
    expect(getMysteryPrizePoints(joker)).toBe(40);
  });

  it("adds up two halves of the same kind", () => {
    const doubleChips = {
      kind: "joker" as const,
      prizes: [
        { amount: 2, kind: "bigBlinds" as const },
        { amount: 3, kind: "bigBlinds" as const },
      ],
    };

    expect(getMysteryPrizeChips(doubleChips, 400)).toBe(2000);
  });

  // Two passes are two entries, and a regular one never covers a VIP seat.
  it("pays both passes a Joker turns up", () => {
    const twoPasses = {
      kind: "joker" as const,
      prizes: [
        { kind: "pass" as const, pass: "regular" as const },
        { kind: "pass" as const, pass: "vip" as const },
      ],
    };

    expect(getMysteryPrizePasses(twoPasses)).toEqual(["regular", "vip"]);
  });

  it("names both halves for the dealer and the log", () => {
    expect(describeMysteryPrize(joker)).toBe("Джокер: 2 ББ в стек + 40 PTS");
  });
});
