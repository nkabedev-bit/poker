import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS_TOTAL,
  countEarnedAchievements,
  EMPTY_PLAYER_STATS,
  getAchievementSections,
  getAchievements,
  type PlayerStats,
} from "@/lib/client/achievements";

function achievementsFor(stats: Partial<PlayerStats>) {
  return getAchievements({ ...EMPTY_PLAYER_STATS, ...stats });
}

function badge(stats: Partial<PlayerStats>, id: string) {
  return achievementsFor(stats).find((item) => item.id === id);
}

describe("achievements", () => {
  it("gives nothing to a player who never played", () => {
    expect(countEarnedAchievements(achievementsFor({}))).toBe(0);
    expect(getAchievements(EMPTY_PLAYER_STATS)).toHaveLength(ACHIEVEMENTS_TOTAL);
  });

  it("counts games attended", () => {
    const earned = achievementsFor({ games: 3 }).filter((item) => item.earned);

    expect(earned.map((item) => item.id)).toEqual(["debut", "first-vibe"]);
  });

  it("counts top-3 finishes apart from the final table", () => {
    expect(badge({ top3: 5 }, "in-rhythm")?.earned).toBe(true);
    expect(badge({ top3: 5 }, "real-rival")).toMatchObject({ earned: false, goal: 10, value: 5 });
  });

  it("counts wins, up to the club's own face", () => {
    const earned = achievementsFor({ wins: 10 }).filter((item) => item.earned);

    expect(earned.map((item) => item.id)).toEqual([
      "first-trophy",
      "title-collector",
      "well-known",
      "face-of-majestic",
    ]);
  });

  it("hands the early flight to a player who finished last", () => {
    expect(badge({ lastPlace: 1 }, "early-flight")?.earned).toBe(true);
  });

  // 11 knockouts in one tournament clear the 5 and the 8, but not the 12.
  it("earns every knockout badge whose goal the best tournament passed", () => {
    const earned = achievementsFor({ bestTournamentBounty: 11 })
      .filter((item) => item.earned)
      .map((item) => item.title);

    expect(earned).toEqual(["Точный прицел", "Шторм за столом"]);
  });

  it("reads the best single tournament for the knockout badges", () => {
    const stats = { bestTournamentBounty: 10.5 };

    expect(badge(stats, "precise-aim")?.earned).toBe(true);
    expect(badge(stats, "table-storm")?.earned).toBe(true);
    // 12 knockouts in one tournament is still ahead.
    expect(badge(stats, "butcher")).toMatchObject({ earned: false, goal: 12, value: 10.5 });
  });

  it("reads the longest run of final tables, not the current one", () => {
    expect(badge({ bestTop9Streak: 3 }, "caught-the-wave")?.earned).toBe(true);
    expect(badge({ bestTop9Streak: 3 }, "series-shark")?.earned).toBe(true);
    expect(badge({ bestTop9Streak: 3 }, "perfect-distance")?.earned).toBe(false);
  });

  it("rewards surviving a run without a single final table", () => {
    expect(badge({ bestMissStreak: 5 }, "character-test")?.earned).toBe(true);
  });

  it("groups the badges into the club's five sections", () => {
    const sections = getAchievementSections(EMPTY_PLAYER_STATS);

    expect(sections.map((section) => section.title)).toEqual([
      "Посещение игр",
      "Попадания в топ-3",
      "Победы",
      "Специальные достижения",
      "Попади в топ-9",
    ]);
  });

  it("speaks of the final table rather than points, and carries the club's own name", () => {
    const all = getAchievements(EMPTY_PLAYER_STATS);
    const streakBadges = all.filter((item) => item.id.startsWith("caught") || item.id === "character-test");

    for (const item of streakBadges) {
      expect(item.description).toContain("финальн");
      expect(item.description).not.toContain("очках");
    }

    expect(all.some((item) => item.title === "Лицо Majestic")).toBe(true);
    expect(all.some((item) => item.title.includes("Magnum"))).toBe(false);
  });
});
