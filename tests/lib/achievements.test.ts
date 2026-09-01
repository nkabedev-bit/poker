import { describe, expect, it } from "vitest";
import {
  countEarnedAchievements,
  getAchievements,
  getPlayerLevel,
} from "@/lib/client/achievements";

function achievementsFor(stats: { eliminations?: number; games?: number; top9?: number }) {
  return getAchievements({ eliminations: 0, games: 0, top9: 0, ...stats });
}

describe("player level", () => {
  it("starts every newcomer at FISH", () => {
    expect(getPlayerLevel(0).title).toBe("FISH");
    expect(getPlayerLevel(4).title).toBe("FISH");
  });

  it("climbs the ladder with games played", () => {
    expect(getPlayerLevel(5).title).toBe("SEMI-REG");
    expect(getPlayerLevel(20).title).toBe("REG");
    expect(getPlayerLevel(50).title).toBe("SHARK");
    expect(getPlayerLevel(100).title).toBe("LEGEND");
  });

  it("reports progress towards the next level", () => {
    const level = getPlayerLevel(10);

    expect(level.next).toEqual({ games: 20, title: "REG" });
    expect(level.progress).toBeCloseTo((10 - 5) / (20 - 5));
  });

  it("caps progress at the top of the ladder", () => {
    const level = getPlayerLevel(500);

    expect(level.next).toBeNull();
    expect(level.progress).toBe(1);
  });
});

describe("achievements", () => {
  it("gives nothing to a player who never played", () => {
    expect(countEarnedAchievements(achievementsFor({}))).toBe(0);
  });

  it("earns the first-game badge after a single tournament", () => {
    const first = achievementsFor({ games: 1 }).find((item) => item.id === "first-game");

    expect(first?.earned).toBe(true);
  });

  it("tracks partial progress towards a goal", () => {
    const hunter = achievementsFor({ eliminations: 5 }).find((item) => item.id === "hunter");

    expect(hunter).toMatchObject({ earned: false, goal: 25, value: 5 });
    expect(hunter?.progress).toBeCloseTo(5 / 25);
  });

  // Knockouts are stored as a numeric because a split bounty pays fractions.
  it("floors fractional knockouts rather than showing 2.5", () => {
    const firstBlood = achievementsFor({ eliminations: 2.5 }).find(
      (item) => item.id === "first-blood",
    );

    expect(firstBlood?.value).toBe(2);
  });

  it("earns every badge a veteran has cleared", () => {
    const veteran = achievementsFor({ eliminations: 120, games: 60, top9: 12 });

    expect(countEarnedAchievements(veteran)).toBe(8);
  });
});
