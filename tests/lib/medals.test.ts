import { describe, expect, it } from "vitest";
import { countEarnedMedals, getMedals, MEDAL_KEYS, MEDALS_TOTAL } from "@/lib/client/medals";

describe("medals", () => {
  it("offers one medal per tournament the club runs", () => {
    expect(MEDALS_TOTAL).toBe(7);
    expect(getMedals({}).map((medal) => medal.key)).toEqual([...MEDAL_KEYS]);
  });

  it("starts every medal at zero for a player who never won", () => {
    const medals = getMedals({});

    expect(medals.every((medal) => medal.count === 0)).toBe(true);
    expect(countEarnedMedals(medals)).toBe(0);
  });

  it("counts each win of the same tournament type on one medal", () => {
    const freeroll = getMedals({ freeroll: 2 }).find((medal) => medal.key === "freeroll");

    expect(freeroll).toMatchObject({ count: 2, title: "FREEROLL" });
  });

  it("counts how many different medals the player has taken", () => {
    expect(countEarnedMedals(getMedals({ freeroll: 2, phoenix: 1 }))).toBe(2);
  });

  it("ignores counters that are missing, negative or not a number", () => {
    const medals = getMedals({ bounty: -3, mystery: "нет", phoenix: null });

    expect(medals.every((medal) => medal.count === 0)).toBe(true);
  });

  it("survives a player record with no medals at all", () => {
    expect(getMedals(null)).toHaveLength(MEDALS_TOTAL);
  });
});
