import { describe, expect, it } from "vitest";
import {
  buildEliminationSheetRows,
  buildPlayerOrderRows,
  buildVipSheetGrid,
  removeFromVipSheetGrid,
  getEffectiveSessionStart,
  getEliminationSheetName,
  getMoscowDayRange,
  getSheetStandingsPlayers,
  getVipPlayersForGame,
} from "@/lib/google-sheets";
import type { TournamentPlayer } from "@/lib/timer/types";

function vipPlayer(
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
      vipPlayer("c", "Carol", { registrationNumber: 22 }),
      vipPlayer("a", "Alice", { registrationNumber: 1 }),
      vipPlayer("nonum", "Nobody"), // no registration number -> excluded
      vipPlayer("b", "Bob", { registrationNumber: 19, status: "eliminated" }),
    ];

    expect(buildPlayerOrderRows(players)).toEqual([
      [1, "Alice"],
      [19, "Bob"],
      [22, "Carol"],
    ]);
  });
});

describe("VIP sheet", () => {
  it("selects VIP players solely by registration number 19-27 (category is ignored)", () => {
    const players = [
      vipPlayer("a", "Alice", { registrationNumber: 19 }),
      vipPlayer("b", "Bob", { registrationNumber: 5, category: "VIP" }),
      vipPlayer("c", "Carol", { registrationNumber: 27 }),
      vipPlayer("d", "Dave", { category: "VIP" }), // no number -> not VIP
    ];

    expect(getVipPlayersForGame(players)).toEqual(["Alice", "Carol"]);
  });

  it("anchors the summary at A/B and creates the first game column with count 1", () => {
    const grid = buildVipSheetGrid([], "04/06", ["Alice", "Carol"]);

    expect(grid).toEqual([
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", 1, "", "Alice"],
      ["Carol", 1, "", "Carol"],
    ]);
  });

  it("is idempotent when re-syncing the same game date", () => {
    const first = buildVipSheetGrid([], "04/06", ["Alice"]);
    const stringified = first.map((row) => row.map((cell) => String(cell)));
    const second = buildVipSheetGrid(stringified, "04/06", ["Alice", "Carol"]);

    expect(second).toEqual([
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", 1, "", "Alice"],
      ["Carol", 1, "", "Carol"],
    ]);
  });

  it("appends a new game column to the right and bumps repeat players' counts", () => {
    const existing = [
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", "1", "", "Alice"],
    ];

    const grid = buildVipSheetGrid(existing, "11/06", ["Alice", "Carol"]);

    expect(grid[0]).toEqual(["Игрок", "Раз в VIP", "", "04/06", "11/06"]);
    // Alice is VIP in both games (count 2), Carol in one (count 1).
    expect(grid[1]).toEqual(["Alice", 2, "", "Alice", "Alice"]);
    expect(grid[2]).toEqual(["Carol", 1, "", "", "Carol"]);
  });

  it("does NOT wipe a populated game column when the roster is empty", () => {
    const existing = [
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", "1", "", "Alice"],
      ["Carol", "1", "", "Carol"],
    ];

    const grid = buildVipSheetGrid(existing, "04/06", []);

    expect(grid).toEqual([
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", 1, "", "Alice"],
      ["Carol", 1, "", "Carol"],
    ]);
  });

  it("preserves manually-added summary players that are not in the roster", () => {
    // Owner hand-added Javmaz & Anderson and deleted the game columns.
    const existing = [
      ["Игрок", "Раз в VIP", ""],
      ["Javmaz", "1", ""],
      ["Anderson", "1", ""],
    ];

    const grid = buildVipSheetGrid(existing, "11/06", ["Alice"]);

    expect(grid[0]).toEqual(["Игрок", "Раз в VIP", "", "11/06"]);
    expect(grid[1]).toEqual(["Javmaz", 1, "", "Alice"]);
    expect(grid[2]).toEqual(["Anderson", 1, "", ""]);
    expect(grid[3]).toEqual(["Alice", 1, "", ""]);
  });

  it("preserves stored counts instead of recomputing them from columns", () => {
    // Count is 2 but only one column survives (the other was deleted by hand).
    const existing = [
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", "2", "", "Alice"],
    ];

    const grid = buildVipSheetGrid(existing, "04/06", ["Alice"]);

    // Alice already recorded for 04/06 -> no bump, count stays 2 (not reset to 1).
    expect(grid).toEqual([
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", 2, "", "Alice"],
    ]);
  });

  it("regression: a second game keeps the first game's column (2026-06-07 incident)", () => {
    // The 04/06 game recorded 9 VIP players; Саймон is one of them.
    const existing = [
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["1$", "1", "", "Seka_Machine"],
      ["ДЕД", "1", "", "Саймон"],
      ["Саймон", "1", "", "ДЕД"],
      ["Izya", "1", "", "Neklid"],
      ["Kr.ma.vl", "1", "", "Kr.ma.vl"],
      ["Neklid", "1", "", "1$"],
      ["Seka_Machine", "1", "", "Izya"],
      ["Javmaz", "1", "", "Javmaz"],
      ["Anderson", "1", "", "Anderson"],
    ];

    // 07/06 game: 6 VIP players, Саймон plays again.
    const grid = buildVipSheetGrid(existing, "07/06", [
      "Gal",
      "Саймон",
      "ZHAR",
      "Юран",
      "inrikki",
      "Киберпсих",
    ]);

    // Both game columns survive side by side.
    expect(grid[0]).toEqual(["Игрок", "Раз в VIP", "", "04/06", "07/06"]);
    // Саймон appeared in both games -> count 2, not 1.
    const simon = grid.find((row) => row[0] === "Саймон");
    expect(simon?.[1]).toBe(2);
    // The 04/06 column is byte-for-byte preserved.
    expect(grid.slice(1).map((row) => row[3])).toEqual([
      "Seka_Machine",
      "Саймон",
      "ДЕД",
      "Neklid",
      "Kr.ma.vl",
      "1$",
      "Izya",
      "Javmaz",
      "Anderson",
      "",
      "",
      "",
      "",
      "",
    ]);
  });

  it("superset invariant: no non-empty cell ever becomes empty after an additive merge", () => {
    const existing = [
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", "1", "", "Alice"],
      ["Bob", "1", "", "Bob"],
    ];

    const grid = buildVipSheetGrid(existing, "11/06", ["Alice", "Carol"]);

    for (let row = 0; row < existing.length; row += 1) {
      for (let col = 0; col < existing[row].length; col += 1) {
        const before = existing[row][col];
        if (before === "") continue;
        // Counts may grow (string "1" -> number 2); only assert it never blanks.
        expect(String(grid[row]?.[col] ?? "")).not.toBe("");
      }
    }
  });

  it("removes an erroneous VIP entry from the current game's column and -1 its counter", () => {
    const existing = [
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", "1", "", "Alice"],
      ["Carol", "1", "", "Carol"],
    ];

    const grid = removeFromVipSheetGrid(existing, "04/06", "Carol");

    // Carol's count hit 0 -> summary row dropped; column entry removed.
    expect(grid).toEqual([
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", 1, "", "Alice"],
    ]);
  });

  it("keeps a removed player who was VIP in other games (counter just -1)", () => {
    const existing = [
      ["Игрок", "Раз в VIP", "", "28/05", "04/06"],
      ["Alice", "2", "", "Alice", "Alice"],
    ];

    const grid = removeFromVipSheetGrid(existing, "04/06", "Alice");

    // Alice removed from 04/06 only; still counted for 28/05; the now-empty 04/06 column drops.
    expect(grid).toEqual([
      ["Игрок", "Раз в VIP", "", "28/05"],
      ["Alice", 1, "", "Alice"],
    ]);
  });

  it("does not touch manual entries or other players when removing a player", () => {
    const existing = [
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Javmaz", "1", "", "Carol"], // Javmaz/Anderson are manual summary-only entries
      ["Anderson", "1", "", "Dave"],
    ];

    const grid = removeFromVipSheetGrid(existing, "04/06", "Carol");

    // Carol removed from the column; Dave stays; Javmaz/Anderson summary preserved.
    expect(grid).toEqual([
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Javmaz", 1, "", "Dave"],
      ["Anderson", 1, "", ""],
    ]);
  });

  it("is a no-op when the player is not in the game column", () => {
    const existing = [
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", "1", "", "Alice"],
    ];

    expect(removeFromVipSheetGrid(existing, "04/06", "Nobody")).toEqual([
      ["Игрок", "Раз в VIP", "", "04/06"],
      ["Alice", 1, "", "Alice"],
    ]);
  });
});
