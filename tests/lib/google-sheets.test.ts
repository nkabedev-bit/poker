import { describe, expect, it } from "vitest";
import {
  buildEliminationSheetRows,
  buildPlayerOrderRows,
  getEffectiveSessionStart,
  getEliminationSheetName,
  getMoscowDayRange,
  getSheetStandingsPlayers,
  pickTodayBirthdayNicknames,
  pickUpcomingBirthdays,
} from "@/lib/google-sheets";
import type { TournamentPlayer } from "@/lib/timer/types";

function rosterPlayer(
  id: string,
  name: string,
  overrides: Partial<TournamentPlayer> = {},
): TournamentPlayer {
  return {
    id,
    name,
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    rebuys: 0,
    seat: null,
    stack: 1000,
    status: "active",
    table: null,
    ...overrides,
  };
}

function player(id: string, name: string, finishPlace: number | null): TournamentPlayer {
  return {
    id,
    name,
    addons: 0,
    bountyCount: 0,
    finishPlace,
    rebuys: 0,
    seat: null,
    stack: 1000,
    status: finishPlace && finishPlace > 1 ? "eliminated" : "active",
    table: null,
  };
}

describe("Google Sheets tournament day sync helpers", () => {
  it("builds Moscow day range boundaries for filtering bounty logs", () => {
    expect(getMoscowDayRange(new Date("2026-05-30T12:00:00.000Z"))).toEqual({
      startIso: "2026-05-29T21:00:00.000Z",
      endIso: "2026-05-30T21:00:00.000Z",
    });
  });

  it("uses the tournament start date for the elimination sheet name", () => {
    expect(getEliminationSheetName("2026-05-30T20:30:00.000Z")).toBe("30/05");
  });

  it("keeps a recent session start (current game)", () => {
    // Session 5 hours ago -> still the current game.
    expect(
      getEffectiveSessionStart("2026-06-04T13:00:00.000Z", new Date("2026-06-04T18:00:00.000Z")),
    ).toBe("2026-06-04T13:00:00.000Z");
  });

  it("keeps a single date label for a game that runs past midnight", () => {
    // Game started Moscow 2026-06-04 22:00 (UTC 19:00); now Moscow 2026-06-05 01:00 (UTC 22:00).
    const sessionStart = "2026-06-04T19:00:00.000Z";
    const afterMidnight = new Date("2026-06-04T22:00:00.000Z");
    const effective = getEffectiveSessionStart(sessionStart, afterMidnight);
    expect(effective).toBe(sessionStart);
    // Label stays on the start day, no split to 05/06.
    expect(getEliminationSheetName(effective)).toBe("04/06");
  });

  it("treats a session start older than a game span as stale (falls back to today)", () => {
    // Stale 31/05 session while the real game is on 04/06 -> ignored.
    expect(
      getEffectiveSessionStart("2026-05-31T20:00:00.000Z", new Date("2026-06-04T18:00:00.000Z")),
    ).toBeNull();
  });

  it("returns null for an absent or invalid session start", () => {
    expect(getEffectiveSessionStart(null)).toBeNull();
    expect(getEffectiveSessionStart(undefined)).toBeNull();
    expect(getEffectiveSessionStart("not-a-date")).toBeNull();
  });

  it("builds elimination rows without mixing log groups", () => {
    expect(
      buildEliminationSheetRows([
        {
          eliminated_name: "Player 1",
          killers: [{ name: "Killer A" }, { name: "Killer B" }],
          recorded_at: "2026-05-30T09:05:00.000Z",
          uses_reentry: false,
        },
        {
          eliminated_name: "Player 2",
          killers: [],
          recorded_at: "2026-05-30T10:15:00.000Z",
          uses_reentry: true,
        },
        {
          eliminated_name: "Player 3",
          killers: [],
          recorded_at: "2026-05-30T10:25:00.000Z",
          uses_reentry: true,
          reentry_double: true,
        },
      ]),
    ).toEqual([
      ["Player 1", "Killer A / Killer B", "12:05", ""],
      ["Player 2", "—", "13:15", "Да"],
      ["Player 3", "—", "13:25", "Да x2"],
    ]);
  });

  it("uses the last bounty log snapshot for standings after players are cleared", () => {
    const finalPlayers = [
      player("winner", "Winner", 1),
      player("second", "222", 2),
      player("third", "123", 3),
    ];

    expect(
      getSheetStandingsPlayers([], [
        {
          eliminated_name: "123",
          killers: [],
          players_after: [player("third", "123", 3), player("winner", "Winner", null), player("second", "222", null)],
          recorded_at: "2026-05-30T12:44:00.000Z",
          uses_reentry: false,
        },
        {
          eliminated_name: "222",
          killers: [],
          players_after: finalPlayers,
          recorded_at: "2026-05-30T12:45:00.000Z",
          uses_reentry: false,
        },
      ]),
    ).toBe(finalPlayers);
  });
  it("builds the player order block sorted by registration number without gaps", () => {
    const players = [
      rosterPlayer("c", "Carol", { registrationNumber: 22 }),
      rosterPlayer("a", "Alice", { registrationNumber: 1 }),
      rosterPlayer("nonum", "Nobody"), // no registration number -> excluded
      rosterPlayer("b", "Bob", { registrationNumber: 19, status: "eliminated" }),
    ];

    expect(buildPlayerOrderRows(players)).toEqual([
      [1, "Alice", "", "", ""],
      [19, "Bob", "", "", ""],
      [22, "Carol", "", "", ""],
    ]);
  });

  it("reports addons / single rebuys / double rebuys as counters, blank when zero", () => {
    const players = [
      // rebuys counts every re-entry including doubles, so 3 rebuys with 1 double = 2 singles
      rosterPlayer("a", "Alice", { registrationNumber: 1, addons: 2, rebuys: 3, doubleRebuys: 1 }),
      // a double-only re-entry: singles column stays blank
      rosterPlayer("b", "Bob", { registrationNumber: 2, rebuys: 1, doubleRebuys: 1 }),
      rosterPlayer("c", "Carol", { registrationNumber: 3 }),
    ];

    expect(buildPlayerOrderRows(players)).toEqual([
      [1, "Alice", 2, 2, 1],
      [2, "Bob", "", "", 1],
      [3, "Carol", "", "", ""],
    ]);
  });

  it("regression: keeps the player order block after the game finishes and players are cleared", () => {
    // When the tournament ends, extras.players is wiped before the final sheets sync.
    // The order block must fall back to the last log snapshot, same as the standings,
    // instead of clearing K/L (the 2026-06-09 incident).
    const finalRoster = [
      rosterPlayer("b", "Bob", { registrationNumber: 2, status: "eliminated", finishPlace: 2 }),
      rosterPlayer("a", "Alice", { registrationNumber: 1, finishPlace: 1 }),
    ];

    const standingsPlayers = getSheetStandingsPlayers([], [
      {
        eliminated_name: "Bob",
        killers: [],
        players_after: finalRoster,
        recorded_at: "2026-06-09T21:30:00.000Z",
        uses_reentry: false,
      },
    ]);

    expect(buildPlayerOrderRows(standingsPlayers)).toEqual([
      [1, "Alice", "", "", ""],
      [2, "Bob", "", "", ""],
    ]);
  });
});

describe("birthday notifications (анкеты sheet)", () => {
  // Moscow 2026-07-05 12:00 -> today is "05.07".
  const july5 = new Date("2026-07-05T09:00:00.000Z");

  // A questionnaire row: E (index 4) is the game nickname, G (index 6) the birth date.
  function anketaRow(nickname: string, birthDate: string): string[] {
    const row = Array<string>(11).fill("");
    row[4] = nickname;
    row[6] = birthDate;
    return row;
  }

  it("returns the game nickname of a player whose birthday is today", () => {
    const grid = [["header"], anketaRow("Хайроллер", "05.07")];

    expect(pickTodayBirthdayNicknames(grid, july5)).toEqual(["Хайроллер"]);
  });

  it("matches day+month regardless of the stored date format", () => {
    const grid = [
      ["header"],
      anketaRow("Numeric", "5.7"),
      anketaRow("WithYear", "05.07.1990"),
      anketaRow("Russian", "5 июля"),
    ];

    expect(pickTodayBirthdayNicknames(grid, july5)).toEqual(["Numeric", "WithYear", "Russian"]);
  });

  it("ignores players whose birthday is not today", () => {
    const grid = [["header"], anketaRow("Tomorrow", "06.07"), anketaRow("Today", "05.07")];

    expect(pickTodayBirthdayNicknames(grid, july5)).toEqual(["Today"]);
  });

  it("collapses duplicate questionnaires by nickname, case-insensitive", () => {
    const grid = [["header"], anketaRow("Саймон", "05.07"), anketaRow("саймон", "05.07")];

    expect(pickTodayBirthdayNicknames(grid, july5)).toEqual(["Саймон"]);
  });

  it("skips a matching row whose nickname is empty", () => {
    const grid = [["header"], anketaRow("", "05.07")];

    expect(pickTodayBirthdayNicknames(grid, july5)).toEqual([]);
  });

  it("skips the header row and rows without a birth date", () => {
    const grid = [["header"], anketaRow("NoDate", "")];

    expect(pickTodayBirthdayNicknames(grid, july5)).toEqual([]);
  });

  // The pg_cron job fires at 21:00 UTC, which is 00:00 Moscow of the NEXT day. The notice
  // must therefore be about that next day — a 02.09 birthday is announced by the run at
  // 21:00 UTC on 01.09, and the 01.09 birthday is already yesterday by then.
  it("announces the day that has just started in Moscow, not the UTC day", () => {
    const midnightMoscow = new Date("2026-09-01T21:00:00.000Z");
    const grid = [["header"], anketaRow("Второго", "02.09"), anketaRow("Первого", "01.09")];

    expect(pickTodayBirthdayNicknames(grid, midnightMoscow)).toEqual(["Второго"]);
  });
});

describe("upcoming birthdays digest (анкеты sheet)", () => {
  // Moscow 2026-07-05 12:00 -> today is "05.07".
  const july5 = new Date("2026-07-05T09:00:00.000Z");

  function anketaRow(nickname: string, birthDate: string): string[] {
    const row = Array<string>(11).fill("");
    row[4] = nickname;
    row[6] = birthDate;
    return row;
  }

  it("lists the coming month nearest first, counting today as zero days away", () => {
    const grid = [
      ["header"],
      anketaRow("Через месяц", "04.08"),
      anketaRow("Сегодня", "05.07"),
      anketaRow("Завтра", "06.07"),
    ];

    expect(pickUpcomingBirthdays(grid, { date: july5 })).toEqual([
      { date: "05.07", daysUntil: 0, nickname: "Сегодня" },
      { date: "06.07", daysUntil: 1, nickname: "Завтра" },
      { date: "04.08", daysUntil: 30, nickname: "Через месяц" },
    ]);
  });

  it("leaves out birthdays past the window", () => {
    const grid = [["header"], anketaRow("Слишком поздно", "05.08"), anketaRow("Вчера", "04.07")];

    expect(pickUpcomingBirthdays(grid, { date: july5 })).toEqual([]);
  });

  it("carries a date that already passed this year over to the next one", () => {
    // 2026-12-20, so 05.01 belongs to 2027 — 16 days away, not 349 days behind.
    const december20 = new Date("2026-12-20T09:00:00.000Z");
    const grid = [["header"], anketaRow("Новогодний", "05.01")];

    expect(pickUpcomingBirthdays(grid, { date: december20 })).toEqual([
      { date: "05.01", daysUntil: 16, nickname: "Новогодний" },
    ]);
  });

  it("understands the same date formats as the daily notification", () => {
    const grid = [["header"], anketaRow("Numeric", "6.7"), anketaRow("WithYear", "07.07.1990")];

    expect(pickUpcomingBirthdays(grid, { date: july5 }).map((item) => item.nickname)).toEqual([
      "Numeric",
      "WithYear",
    ]);
  });

  it("keeps the nearest date when a nickname has two questionnaires", () => {
    const grid = [["header"], anketaRow("Саймон", "20.07"), anketaRow("саймон", "06.07")];

    expect(pickUpcomingBirthdays(grid, { date: july5 })).toEqual([
      { date: "06.07", daysUntil: 1, nickname: "саймон" },
    ]);
  });

  it("skips the header, empty dates and rows without a nickname", () => {
    const grid = [["header"], anketaRow("", "06.07"), anketaRow("NoDate", "")];

    expect(pickUpcomingBirthdays(grid, { date: july5 })).toEqual([]);
  });

  it("honours a custom window", () => {
    const grid = [["header"], anketaRow("Через неделю", "12.07")];

    expect(pickUpcomingBirthdays(grid, { date: july5, days: 3 })).toEqual([]);
    expect(pickUpcomingBirthdays(grid, { date: july5, days: 7 })).toHaveLength(1);
  });
});
