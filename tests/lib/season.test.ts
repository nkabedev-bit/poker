import { describe, expect, it } from "vitest";
import { buildSeasonStandings, findSeasonForDate, mapSeasonRow } from "@/lib/seasons/season";

function result(points: number, overrides: Record<string, unknown> = {}) {
  return { knockouts: 0, playerName: "Ace", points, telegramId: 1, ...overrides };
}

describe("buildSeasonStandings", () => {
  it("counts every game when the season has no limit", () => {
    const standings = buildSeasonStandings([10, 20, 30, 40, 50, 60].map((points) => result(points)), null);

    expect(standings[0]).toMatchObject({ games: 6, points: 210 });
  });

  // A long season counting five games would throw most of itself away; a short one
  // counting everything rewards turning up. The season carries its own rule.
  it("counts only the best games when the season sets a limit", () => {
    const standings = buildSeasonStandings([10, 50, 40, 30, 20, 5].map((points) => result(points)), 5);

    expect(standings[0]).toMatchObject({ games: 6, points: 150 });
  });

  it("ranks by points and breaks ties on knockouts", () => {
    const standings = buildSeasonStandings(
      [
        result(100, { knockouts: 1, playerName: "Меньше", telegramId: 1 }),
        result(100, { knockouts: 4, playerName: "Больше", telegramId: 2 }),
      ],
      null,
    );

    expect(standings.map((row) => row.playerName)).toEqual(["Больше", "Меньше"]);
    expect(standings.map((row) => row.place)).toEqual([1, 2]);
  });

  it("sums knockouts across every game, counted or not", () => {
    const standings = buildSeasonStandings(
      [result(50, { knockouts: 3 }), result(1, { knockouts: 2 })],
      1,
    );

    expect(standings[0]).toMatchObject({ knockouts: 5, points: 50 });
  });

  it("keeps one line per account even when the nickname changed", () => {
    const standings = buildSeasonStandings(
      [
        result(50, { playerName: "Старый ник", telegramId: 7 }),
        result(30, { playerName: "Новый ник", telegramId: 7 }),
      ],
      null,
    );

    expect(standings).toHaveLength(1);
    expect(standings[0]).toMatchObject({ games: 2, playerName: "Новый ник", points: 80 });
  });

  it("tracks a guest without an account by name", () => {
    const standings = buildSeasonStandings(
      [
        result(50, { playerName: "Гость", telegramId: null }),
        result(30, { playerName: "гость", telegramId: null }),
      ],
      null,
    );

    expect(standings).toHaveLength(1);
  });
});

describe("mapSeasonRow", () => {
  it("reads an open season with no scoring limit", () => {
    const season = mapSeasonRow({
      counted_games: null,
      ends_on: null,
      id: "s1",
      starts_on: "2026-09-01",
      status: "open",
      title: "Осенняя серия",
    });

    expect(season).toEqual({
      countedGames: null,
      endsOn: null,
      id: "s1",
      startsOn: "2026-09-01",
      status: "open",
      title: "Осенняя серия",
    });
  });
});

describe("findSeasonForDate", () => {
  const seasons = [
    mapSeasonRow({ ends_on: null, id: "open", starts_on: "2026-09-01", status: "open", title: "Идёт" }),
    mapSeasonRow({
      ends_on: "2026-08-31",
      id: "closed",
      starts_on: "2026-07-01",
      status: "closed",
      title: "Лето",
    }),
  ];

  it("places a game inside the season that was running", () => {
    expect(findSeasonForDate(seasons, "2026-08-15")?.id).toBe("closed");
    expect(findSeasonForDate(seasons, "2026-09-20")?.id).toBe("open");
  });

  it("leaves a game before every season unplaced", () => {
    expect(findSeasonForDate(seasons, "2026-06-01")).toBeNull();
  });
});
