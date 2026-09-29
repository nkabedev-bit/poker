import { describe, expect, it } from "vitest";
import { EMPTY_PLAYER_STATS, getAchievements, type PlayerStats } from "@/lib/client/achievements";
import { findAwardNews, listHeldAwards } from "@/lib/client/award-news";
import { getMedals } from "@/lib/client/medals";

function achievementsFor(stats: Partial<PlayerStats>) {
  return getAchievements({ ...EMPTY_PLAYER_STATS, ...stats });
}

function ids(awards: ReadonlyArray<{ id: string }>) {
  return awards.map((award) => award.id);
}

describe("award news", () => {
  it("lists what the player holds on every shelf, and nothing they do not", () => {
    const [firstMedal] = getMedals(null);
    const held = listHeldAwards({
      achievements: achievementsFor({ games: 1 }),
      medals: getMedals({ [firstMedal.key]: 2 }),
      tier: "member",
    });

    expect(held.map((award) => `${award.shelf}:${award.id}`)).toEqual([
      "achievements:debut",
      `medals:${firstMedal.key}`,
      "tier:member",
    ]);
    // MEMBER is the rung that opens the favourite hand, and its news says so.
    expect(held[2]).toMatchObject({ icon: "crown", title: "MEMBER" });
    expect(held[2].description).toContain("любимая рука");
  });

  it("fills an empty shelf without a word, so old awards are never news", () => {
    const held = listHeldAwards({ achievements: achievementsFor({ games: 10 }) });

    const { fresh, next } = findAwardNews(held, { achievements: null });

    expect(fresh).toEqual([]);
    expect(next.achievements).toEqual(ids(held));
  });

  it("tells about an award won since the shelf was last looked at", () => {
    const before = listHeldAwards({ achievements: achievementsFor({ games: 1 }) });
    const now = listHeldAwards({ achievements: achievementsFor({ games: 3 }) });

    const { fresh, next } = findAwardNews(now, { achievements: ids(before) });

    expect(ids(fresh)).toEqual(["first-vibe"]);
    expect(next.achievements).toEqual(["debut", "first-vibe"]);
  });

  it("makes the first medal news once the shelf was stored empty", () => {
    const [firstMedal] = getMedals(null);
    const held = listHeldAwards({ medals: getMedals({ [firstMedal.key]: 1 }) });

    expect(ids(findAwardNews(held, { medals: [] }).fresh)).toEqual([firstMedal.key]);
  });

  it("announces a new tier and keeps the ones before it on the shelf", () => {
    const { fresh, next } = findAwardNews(listHeldAwards({ tier: "core" }), { tier: ["member"] });

    expect(fresh).toMatchObject([{ id: "core", shelf: "tier", title: "CORE" }]);
    expect(next.tier).toEqual(["member", "core"]);
  });

  it("leaves alone the shelves a screen was not asked about", () => {
    const held = listHeldAwards({ achievements: achievementsFor({ games: 1 }), tier: "member" });

    const { fresh, next } = findAwardNews(held, { achievements: [] });

    expect(ids(fresh)).toEqual(["debut"]);
    expect(Object.keys(next)).toEqual(["achievements"]);
  });
});
