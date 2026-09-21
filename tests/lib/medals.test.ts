import { describe, expect, it } from "vitest";
import {
  ARCHIVE_MEDAL_DESCRIPTION,
  ARCHIVE_MEDAL_KEYS,
  countEarnedMedals,
  getArchiveMedals,
  getMedals,
  MEDAL_KEYS,
  MEDALS_TOTAL,
} from "@/lib/client/medals";

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

describe("archive medals", () => {
  it("offers one medal per tournament the club has stopped running", () => {
    expect(getArchiveMedals({}).map((medal) => medal.key)).toEqual([...ARCHIVE_MEDAL_KEYS]);
  });

  it("keeps the archive out of the counter of the medals still to be won", () => {
    expect(MEDALS_TOTAL).toBe(7);
    expect(getMedals({ mttclassic: 1, dealer: 1, wanted: 1 }).every((m) => m.count === 0)).toBe(
      true,
    );
  });

  it("counts a repeated win of an archive tournament on one medal", () => {
    expect(getArchiveMedals({ dealer: 2 })).toContainEqual(
      expect.objectContaining({ count: 2, key: "dealer", title: "DEALER REVENGE" }),
    );
  });

  it("ignores counters that are missing, negative or not a number", () => {
    const medals = getArchiveMedals({ mttclassic: -1, wanted: "нет", dealer: null });

    expect(medals.every((medal) => medal.count === 0)).toBe(true);
  });

  it("says a medal is for a tournament that is no longer run", () => {
    expect(getArchiveMedals({}).every((m) => m.description === ARCHIVE_MEDAL_DESCRIPTION)).toBe(
      true,
    );
  });
});
