import { describe, expect, it } from "vitest";
import {
  arrangeSeasonsForRating,
  buildSeasonStandings,
  findSeasonForDate,
  mapSeasonRow,
} from "@/lib/seasons/season";

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
  // The row read before migration 202609140001 has no `parallel` column at all.
  it("reads an open season with no scoring limit as a regular one", () => {
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
      parallel: false,
      startsOn: "2026-09-01",
      status: "open",
      title: "Осенняя серия",
    });
  });

  it("reads a parallel season", () => {
    const season = mapSeasonRow({
      counted_games: null,
      ends_on: "2026-10-06",
      id: "apc",
      parallel: true,
      starts_on: "2026-09-15",
      status: "open",
      title: "Отбор на кубок APC",
    });

    expect(season).toMatchObject({ endsOn: "2026-10-06", parallel: true });
  });
});

describe("arrangeSeasonsForRating", () => {
  function season(row: Record<string, unknown>) {
    return mapSeasonRow({ counted_games: null, ends_on: null, status: "open", ...row });
  }

  const apc = season({
    ends_on: "2026-10-06",
    id: "apc",
    parallel: true,
    starts_on: "2026-09-15",
    title: "Отбор на кубок APC",
  });
  const autumn = season({ id: "autumn", starts_on: "2026-09-01", title: "Autumn Series" });
  const august = season({
    ends_on: "2026-08-31",
    id: "august",
    starts_on: "2026-08-01",
    status: "closed",
    title: "Summer Series август",
  });

  // The qualifier starts later, so by date alone it would take over the home screen.
  it("opens on the regular season while the APC qualifier runs beside it", () => {
    const arranged = arrangeSeasonsForRating([apc, autumn, august]);

    expect(arranged.map((item) => item.id)).toEqual(["autumn", "apc", "august"]);
  });

  it("keeps the finished APC qualifier among the past seasons", () => {
    const winter = season({ id: "winter", starts_on: "2026-12-01", title: "Winter Series" });
    const closedAutumn = { ...autumn, status: "closed" as const };
    const closedApc = { ...apc, status: "closed" as const };

    const arranged = arrangeSeasonsForRating([winter, closedApc, closedAutumn, august]);

    expect(arranged.map((item) => item.id)).toEqual(["winter", "apc", "autumn", "august"]);
  });

  it("opens on the latest regular season when only the parallel one is open", () => {
    const closedAutumn = { ...autumn, status: "closed" as const };

    const arranged = arrangeSeasonsForRating([apc, closedAutumn, august]);

    expect(arranged.map((item) => item.id)).toEqual(["autumn", "apc", "august"]);
  });

  it("leaves the order alone when there is no parallel season", () => {
    const arranged = arrangeSeasonsForRating([autumn, august]);

    expect(arranged.map((item) => item.id)).toEqual(["autumn", "august"]);
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
