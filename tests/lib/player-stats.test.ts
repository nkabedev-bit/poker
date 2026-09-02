import { describe, expect, it } from "vitest";
import { buildPlayerResultsFilter, computePlayerStats } from "@/lib/results/player-stats";

describe("computePlayerStats", () => {
  it("counts a game per stored result", () => {
    const stats = computePlayerStats([
      { knockouts: 0, place: 12 },
      { knockouts: 0, place: 3 },
    ]);

    expect(stats.games).toBe(2);
  });

  it("sums knockouts across every game", () => {
    expect(computePlayerStats([{ knockouts: 2, place: 1 }, { knockouts: 1.5, place: 8 }]))
      .toMatchObject({ eliminations: 3.5 });
  });

  it("counts top-9 finishes and nothing below", () => {
    const stats = computePlayerStats([
      { knockouts: 0, place: 1 },
      { knockouts: 0, place: 9 },
      { knockouts: 0, place: 10 },
      { knockouts: 0, place: null },
    ]);

    expect(stats.top9).toBe(2);
  });

  it("ignores a negative knockout count from a broken row", () => {
    expect(computePlayerStats([{ knockouts: -5, place: 1 }]).eliminations).toBe(0);
  });

  it("reports zeroes for a player who never played", () => {
    expect(computePlayerStats([])).toEqual({ eliminations: 0, games: 0, top9: 0 });
  });
});

describe("buildPlayerResultsFilter", () => {
  // Imported games and hand-added players carry a name, not an account.
  it("matches by account and by nickname", () => {
    expect(buildPlayerResultsFilter(42, "Ace High")).toBe(
      "telegram_id.eq.42,player_name.ilike.Ace High",
    );
  });

  it("matches by account alone when there is no nickname", () => {
    expect(buildPlayerResultsFilter(42, "   ")).toBe("telegram_id.eq.42");
  });

  it("escapes the wildcards a nickname may contain", () => {
    expect(buildPlayerResultsFilter(42, "100%_ace")).toContain("100\\%\\_ace");
  });
});
