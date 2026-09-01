import { describe, expect, it } from "vitest";
import {
  buildMonthlyStandings,
  buildTournamentResultRows,
  getMonthRange,
  toMonthKey,
} from "@/lib/results/tournament-results";
import type { TournamentPlayer } from "@/lib/timer/types";

function player(overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id: crypto.randomUUID(),
    name: "Игрок",
    rebuys: 0,
    seat: null,
    stack: 1000,
    status: "eliminated",
    table: 1,
    ...overrides,
  };
}

const PTS = { bountyPoints: 10, bountyType: "standard" as const, placePoints: [100, 80, 60] };

describe("buildTournamentResultRows", () => {
  it("records a row per finished player, ordered by place", () => {
    const rows = buildTournamentResultRows(
      [
        player({ finishPlace: 2, name: "Второй" }),
        player({ finishPlace: 1, name: "Первый" }),
      ],
      PTS,
    );

    expect(rows.map((row) => row.playerName)).toEqual(["Первый", "Второй"]);
  });

  it("takes the points from the PTS standings", () => {
    const rows = buildTournamentResultRows(
      [player({ bountyCount: 2, finishPlace: 1, name: "Первый" })],
      PTS,
    );

    // 100 for the place plus two knockouts at 10.
    expect(rows[0]).toMatchObject({ knockouts: 2, place: 1, points: 120 });
  });

  // Someone who busted outside the scoring places still needs a row, or they can never
  // look up where they finished.
  it("keeps players below the scoring places with zero points", () => {
    const rows = buildTournamentResultRows([player({ finishPlace: 40, name: "Сороковой" })], PTS);

    expect(rows[0]).toMatchObject({ place: 40, points: 0 });
  });

  it("ignores players who never finished", () => {
    expect(buildTournamentResultRows([player({ finishPlace: null })], PTS)).toEqual([]);
  });

  it("carries the account so the result reaches the right profile", () => {
    const rows = buildTournamentResultRows(
      [player({ finishPlace: 1, telegramId: 42 })],
      PTS,
    );

    expect(rows[0].telegramId).toBe(42);
  });
});

describe("buildMonthlyStandings", () => {
  function result(points: number, overrides: Record<string, unknown> = {}) {
    return {
      knockouts: 0,
      place: 1,
      playerName: "Ace",
      points,
      telegramId: 1,
      ...overrides,
    };
  }

  it("counts only a player's best games", () => {
    const standings = buildMonthlyStandings(
      [10, 50, 40, 30, 20, 5].map((points) => result(points)),
      5,
    );

    // The 5 is dropped: 50 + 40 + 30 + 20 + 10.
    expect(standings[0]).toMatchObject({ countedGames: 5, games: 6, points: 150 });
  });

  it("sums knockouts across every game, counted or not", () => {
    const standings = buildMonthlyStandings(
      [result(50, { knockouts: 3 }), result(1, { knockouts: 2 })],
      1,
    );

    expect(standings[0]).toMatchObject({ knockouts: 5, points: 50 });
  });

  it("ranks by points, breaking ties on knockouts", () => {
    const standings = buildMonthlyStandings([
      result(100, { knockouts: 1, playerName: "Меньше", telegramId: 1 }),
      result(100, { knockouts: 4, playerName: "Больше", telegramId: 2 }),
    ]);

    expect(standings.map((row) => row.playerName)).toEqual(["Больше", "Меньше"]);
  });

  it("keeps one line per account even when the nickname changed", () => {
    const standings = buildMonthlyStandings([
      result(50, { playerName: "Старый ник", telegramId: 7 }),
      result(30, { playerName: "Новый ник", telegramId: 7 }),
    ]);

    expect(standings).toHaveLength(1);
    expect(standings[0]).toMatchObject({ games: 2, playerName: "Новый ник", points: 80 });
  });

  it("tracks a guest without an account by name", () => {
    const standings = buildMonthlyStandings([
      result(50, { playerName: "Гость", telegramId: null }),
      result(30, { playerName: "гость", telegramId: null }),
    ]);

    expect(standings).toHaveLength(1);
    expect(standings[0].points).toBe(80);
  });
});

describe("month keys", () => {
  it("formats the key the client sends back", () => {
    expect(toMonthKey(new Date("2026-09-14T20:00:00.000Z"))).toBe("2026-09");
  });

  it("spans a whole month, ending before the next one starts", () => {
    expect(getMonthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-10-01" });
  });

  it("rolls the year over in December", () => {
    expect(getMonthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });
});
