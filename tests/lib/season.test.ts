import { describe, expect, it } from "vitest";
import {
  arrangeSeasonsForRating,
  buildSeasonStandings,
  describeNextCountedGame,
  findSeasonForDate,
  findSeasonLine,
  findSeasonsDueToClose,
  groupSeasonLines,
  mapSeasonRow,
  splitCountedGames,
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

  // A line is the account, so it wears the account's nickname — not the name on
  // whichever of its games happens to be the latest.
  it("names an account's line by the nickname the account goes by now", () => {
    const standings = buildSeasonStandings(
      [
        result(250, { playerName: "1$", telegramId: 887638103 }),
        result(90, { playerName: "Mers cls 055", telegramId: 887638103 }),
      ],
      null,
      new Map([[887638103, "1$"]]),
    );

    expect(standings).toEqual([
      expect.objectContaining({ playerName: "1$", points: 340, telegramId: 887638103 }),
    ]);
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

  // 09.10.2026: Кая played 29.09 as a guest and 06.10 with her new account — two lines
  // under one name, and closing the APC qualifier failed on them.
  it("puts a game played before the account existed on the account's line", () => {
    const standings = buildSeasonStandings(
      [
        result(100, { playerName: "Кая", telegramId: null }),
        result(35, { playerName: "Кая", telegramId: 1694131711 }),
      ],
      null,
    );

    expect(standings).toEqual([
      expect.objectContaining({ games: 2, playerName: "Кая", points: 135, telegramId: 1694131711 }),
    ]);
  });

  it("finds the account for a guest game by the nickname the account goes by now", () => {
    const standings = buildSeasonStandings(
      [
        result(100, { playerName: "Кая", telegramId: null }),
        result(35, { playerName: "Kaya", telegramId: 1694131711 }),
      ],
      null,
      new Map([[1694131711, "Кая"]]),
    );

    expect(standings).toEqual([
      expect.objectContaining({ games: 2, playerName: "Кая", telegramId: 1694131711 }),
    ]);
  });

  it("keeps the account's line when its latest game was played without it", () => {
    const standings = buildSeasonStandings(
      [
        result(35, { playerName: "Кая", telegramId: 1694131711 }),
        result(100, { playerName: "Кая", telegramId: null }),
      ],
      null,
    );

    expect(standings[0]).toMatchObject({ games: 2, telegramId: 1694131711 });
  });

  it("leaves a guest game alone when two accounts go by that nickname", () => {
    const standings = buildSeasonStandings(
      [
        result(10, { playerName: "Макс", telegramId: 1 }),
        result(20, { playerName: "Макс", telegramId: 2 }),
        result(30, { playerName: "Макс", telegramId: null }),
      ],
      null,
    );

    expect(standings).toHaveLength(3);
    expect(standings.find((line) => line.telegramId === null)).toMatchObject({ points: 30 });
  });
});

describe("findSeasonsDueToClose", () => {
  const season = (overrides: Record<string, unknown>) =>
    mapSeasonRow({
      ends_on: "2026-10-07",
      id: "apc",
      parallel: true,
      starts_on: "2026-09-15",
      status: "open",
      title: "Отбор на кубок APC",
      ...overrides,
    });

  it("closes a season once its last day is over in Moscow", () => {
    const due = findSeasonsDueToClose([season({})], new Date("2026-10-08T09:00:00.000Z"));

    expect(due.map((item) => item.id)).toEqual(["apc"]);
  });

  // 23:30 in Moscow on the last day is 20:30 UTC — the last evening is still on.
  it("keeps a season open through its last day", () => {
    expect(findSeasonsDueToClose([season({})], new Date("2026-10-07T20:30:00.000Z"))).toEqual([]);
  });

  it("counts the day after by Moscow time, not by UTC", () => {
    // 00:30 on 8 October in Moscow, still the 7th in UTC.
    const due = findSeasonsDueToClose([season({})], new Date("2026-10-07T21:30:00.000Z"));

    expect(due).toHaveLength(1);
  });

  it("never closes a season without an end date, nor one already closed", () => {
    const due = findSeasonsDueToClose(
      [season({ ends_on: null, id: "autumn" }), season({ id: "spring", status: "closed" })],
      new Date("2026-12-01T09:00:00.000Z"),
    );

    expect(due).toEqual([]);
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

describe("splitCountedGames", () => {
  it("keeps the best games in the count and leaves the rest behind, each part best first", () => {
    const { counted, dropped } = splitCountedGames(
      [{ points: 10 }, { points: 50 }, { points: 30 }, { points: 20 }],
      2,
    );

    expect(counted.map((game) => game.points)).toEqual([50, 30]);
    expect(dropped.map((game) => game.points)).toEqual([20, 10]);
  });

  it("counts every game in a season without a limit", () => {
    const { counted, dropped } = splitCountedGames([{ points: 10 }, { points: 50 }], null);

    expect(counted.map((game) => game.points)).toEqual([50, 10]);
    expect(dropped).toEqual([]);
  });

  it("leaves nothing behind while a player has fewer games than the limit", () => {
    const { counted, dropped } = splitCountedGames([{ points: 10 }], 6);

    expect(counted).toHaveLength(1);
    expect(dropped).toEqual([]);
  });

  // Six players stood on such an edge in November 2026: whichever game goes grey, the sum
  // is the same, but the list must not change its mind between two openings.
  it("counts the earlier of two equal games on the edge", () => {
    const { counted, dropped } = splitCountedGames(
      [
        { points: 40, startedAt: "october" },
        { points: 40, startedAt: "november" },
      ],
      1,
    );

    expect(counted[0].startedAt).toBe("october");
    expect(dropped[0].startedAt).toBe("november");
  });

  it("adds up to the points the table shows", () => {
    const rows = [50, 10, 40, 30, 20, 5].map((points) => result(points));
    const [line] = groupSeasonLines(rows);

    const counted = splitCountedGames(line.rows, 5).counted;
    const sum = counted.reduce((total, row) => total + row.points, 0);

    expect(sum).toBe(buildSeasonStandings(rows, 5)[0].points);
  });
});

describe("describeNextCountedGame", () => {
  it("has nothing to say when the season counts every game", () => {
    expect(describeNextCountedGame([{ points: 10 }], null)).toBeNull();
  });

  it("says how many more games count in any case below the limit", () => {
    expect(describeNextCountedGame([{ points: 10 }], 3)).toEqual({ kind: "any", left: 2 });
    expect(describeNextCountedGame([], 6)).toEqual({ kind: "any", left: 6 });
  });

  it("names the worst counted game to beat once the limit is reached", () => {
    expect(describeNextCountedGame([{ points: 300 }, { points: 120 }], 2)).toEqual({
      kind: "beat",
      points: 120,
    });
  });
});

describe("findSeasonLine", () => {
  const lines = groupSeasonLines(
    [
      result(10, { playerName: "Старый ник", telegramId: 1 }),
      result(20, { playerName: "Гость", telegramId: null }),
      result(30, { playerName: "Другой", telegramId: 2 }),
    ],
    new Map([[1, "Новый ник"]]),
  );

  it("finds a line by the name the table shows", () => {
    expect(findSeasonLine(lines, { key: "новыйник" })?.telegramId).toBe(1);
    expect(findSeasonLine(lines, { key: "гость" })?.name).toBe("Гость");
  });

  // A closed season's table keeps the nickname of the day it was frozen.
  it("finds a renamed player by the nickname their games were played under", () => {
    expect(findSeasonLine(lines, { key: "старыйник" })?.telegramId).toBe(1);
  });

  it("trusts a known account over a name someone else goes by now", () => {
    expect(findSeasonLine(lines, { key: "новыйник", telegramId: 2 })?.name).toBe("Другой");
  });

  it("finds nobody for a stranger", () => {
    expect(findSeasonLine(lines, { key: "никто" })).toBeNull();
  });
});
