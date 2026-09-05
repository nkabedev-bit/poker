import { describe, expect, it } from "vitest";
import {
  buildFieldSizes,
  buildPlayerResultsFilter,
  computePlayerStats,
  countLastPlaces,
} from "@/lib/results/player-stats";

function game(place: number | null, knockouts = 0, day = 1) {
  return { knockouts, place, startedAt: `2026-09-${String(day).padStart(2, "0")}T19:00:00.000Z` };
}

/** A game that also remembers what the player bought to stay in it. */
function paidGame(place: number | null, rebuys: number | null, day = 1) {
  return { ...game(place, 0, day), rebuys };
}

describe("computePlayerStats", () => {
  it("counts a game per stored result", () => {
    expect(computePlayerStats([game(12), game(3, 0, 2)]).games).toBe(2);
  });

  it("sums knockouts across every game and remembers the best night", () => {
    const stats = computePlayerStats([game(1, 2), game(8, 5, 2), game(20, 1, 3)]);

    expect(stats).toMatchObject({ bestTournamentBounty: 5, eliminations: 8 });
  });

  it("counts wins, podiums and final tables", () => {
    const stats = computePlayerStats([game(1), game(3, 0, 2), game(9, 0, 3), game(10, 0, 4)]);

    expect(stats).toMatchObject({ top3: 2, top9: 3, wins: 1 });
  });

  // Streaks read the games in the order they were played, not the order they arrive in.
  it("finds the longest run of final tables", () => {
    const stats = computePlayerStats([
      game(15, 0, 4),
      game(2, 0, 1),
      game(5, 0, 2),
      game(7, 0, 3),
    ]);

    expect(stats.bestTop9Streak).toBe(3);
  });

  it("finds the longest run of missed final tables", () => {
    const stats = computePlayerStats([game(20, 0, 1), game(18, 0, 2), game(4, 0, 3), game(25, 0, 4)]);

    expect(stats.bestMissStreak).toBe(2);
  });

  it("counts a night restored without a place, and lets it break no streak", () => {
    // The club's old monthly tables record the score of an evening but not the finish,
    // so those games count as played and stay out of the streaks.
    const stats = computePlayerStats([
      game(2, 0, 1),
      game(null, 0, 2),
      game(5, 0, 3),
    ]);

    expect(stats).toMatchObject({ bestMissStreak: 0, bestTop9Streak: 2, games: 3, top9: 2 });
  });

  it("ignores a negative knockout count from a broken row", () => {
    expect(computePlayerStats([game(1, -5)]).eliminations).toBe(0);
  });

  it("reports zeroes for a player who never played", () => {
    expect(computePlayerStats([])).toMatchObject({
      bestMissStreak: 0,
      bestTop9Streak: 0,
      eliminations: 0,
      games: 0,
      top3: 0,
      top9: 0,
      wins: 0,
    });
  });
});

describe("the comeback win", () => {
  it("counts a win that ended three tournaments away from the final table", () => {
    const stats = computePlayerStats([game(14, 0, 1), game(20, 0, 2), game(11, 0, 3), game(1, 0, 4)]);

    expect(stats.comebackWins).toBe(1);
  });

  it("asks for three misses, not two", () => {
    expect(computePlayerStats([game(14, 0, 1), game(20, 0, 2), game(1, 0, 3)]).comebackWins).toBe(0);
  });

  // A final table breaks the run even when the player did not win it, so the win that
  // follows is an ordinary one.
  it("forgets the bad run once the player reaches a final table", () => {
    const stats = computePlayerStats([
      game(14, 0, 1),
      game(20, 0, 2),
      game(11, 0, 3),
      game(6, 0, 4),
      game(1, 0, 5),
    ]);

    expect(stats.comebackWins).toBe(0);
  });

  it("counts every comeback, not just the first", () => {
    const stats = computePlayerStats([
      game(14, 0, 1),
      game(15, 0, 2),
      game(16, 0, 3),
      game(1, 0, 4),
      game(17, 0, 5),
      game(18, 0, 6),
      game(19, 0, 7),
      game(1, 0, 8),
    ]);

    expect(stats.comebackWins).toBe(2);
  });
});

describe("the clean podium", () => {
  it("counts a podium taken without buying a re-entry", () => {
    expect(computePlayerStats([paidGame(2, 0)]).cleanPodiums).toBe(1);
  });

  it("does not count a podium the player re-entered into", () => {
    expect(computePlayerStats([paidGame(1, 1)]).cleanPodiums).toBe(0);
  });

  // Games stored before the club kept re-entries say nothing about them, and a badge is
  // not handed out on a guess.
  it("does not count a podium from a game that never recorded re-entries", () => {
    expect(computePlayerStats([paidGame(3, null), game(3)]).cleanPodiums).toBe(0);
  });

  it("asks for the podium, not merely the final table", () => {
    expect(computePlayerStats([paidGame(4, 0)]).cleanPodiums).toBe(0);
  });
});

describe("last places", () => {
  const gameA = "2026-09-01T19:00:00.000Z";
  const gameB = "2026-09-02T19:00:00.000Z";

  const fieldSizes = buildFieldSizes([
    { place: 1, startedAt: gameA },
    { place: 27, startedAt: gameA },
    { place: 1, startedAt: gameB },
    { place: 12, startedAt: gameB },
  ]);

  it("reads each tournament's field size from its largest place", () => {
    expect(fieldSizes.get(gameA)).toBe(27);
    expect(fieldSizes.get(gameB)).toBe(12);
  });

  // 27th is the bottom of one tournament and the middle of another.
  it("counts only the games the player actually finished last in", () => {
    const count = countLastPlaces(
      [
        { knockouts: 0, place: 27, startedAt: gameA },
        { knockouts: 0, place: 12, startedAt: gameB },
      ],
      fieldSizes,
    );

    expect(count).toBe(2);
  });

  it("does not count a middling finish as last", () => {
    const count = countLastPlaces([{ knockouts: 0, place: 12, startedAt: gameA }], fieldSizes);

    expect(count).toBe(0);
  });

  it("ignores a game whose field is unknown", () => {
    const count = countLastPlaces(
      [{ knockouts: 0, place: 5, startedAt: "2026-09-09T19:00:00.000Z" }],
      fieldSizes,
    );

    expect(count).toBe(0);
  });
});

describe("buildPlayerResultsFilter", () => {
  // Imported games and hand-added players carry a name, not an account.
  it("matches by account and by the nickname's key", () => {
    expect(buildPlayerResultsFilter(42, "Ace High")).toBe(
      "telegram_id.eq.42,player_key.eq.acehigh",
    );
  });

  it("finds the same games however the nickname was written", () => {
    expect(buildPlayerResultsFilter(42, "ACE_HIGH")).toBe(buildPlayerResultsFilter(42, "ace high"));
  });

  it("matches by account alone when there is no nickname", () => {
    expect(buildPlayerResultsFilter(42, "   ")).toBe("telegram_id.eq.42");
  });

  // The key drops everything but letters and digits, so a nickname can carry no
  // wildcard into the filter.
  it("strips the punctuation a nickname may contain", () => {
    expect(buildPlayerResultsFilter(42, "100%_ace")).toBe("telegram_id.eq.42,player_key.eq.100ace");
  });
});
