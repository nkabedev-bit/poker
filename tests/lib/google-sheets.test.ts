import { describe, expect, it } from "vitest";
import {
  buildEliminationSheetRows,
  buildVipSheetGrid,
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
      ]),
    ).toEqual([
      ["Player 1", "Killer A / Killer B", "12:05", ""],
      ["Player 2", "—", "13:15", "Да"],
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
});
