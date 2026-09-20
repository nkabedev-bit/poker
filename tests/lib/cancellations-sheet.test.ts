import { describe, expect, it } from "vitest";
import { buildCancellationRows } from "@/lib/players/cancellations";
import { buildCancellationsSheetGrid } from "@/lib/google-sheets";

const ACCOUNTS = [
  { display_name: "Чура", id: "user-1" },
  { display_name: "Олюшка", id: "user-2" },
  { display_name: null, id: "user-3" },
];

describe("buildCancellationRows", () => {
  it("counts each player's cancellations and keeps the latest date", () => {
    const rows = buildCancellationRows(
      [
        { cancelled_at: "2026-09-10T18:00:00.000Z", user_id: "user-1" },
        { cancelled_at: "2026-09-18T20:30:00.000Z", user_id: "user-1" },
        { cancelled_at: "2026-09-12T12:00:00.000Z", user_id: "user-2" },
      ],
      ACCOUNTS,
    );

    expect(rows[0]).toEqual({
      cancellations: 2,
      lastCancelledAt: "2026-09-18T20:30:00.000Z",
      player: "Чура",
    });
    expect(rows[1]).toMatchObject({ cancellations: 1, player: "Олюшка" });
  });

  // The club reads this list to decide who to bar, so the worst offenders come first.
  it("puts the players who cancel most at the top", () => {
    const rows = buildCancellationRows(
      [
        { cancelled_at: "2026-09-12T12:00:00.000Z", user_id: "user-2" },
        { cancelled_at: "2026-09-10T18:00:00.000Z", user_id: "user-1" },
        { cancelled_at: "2026-09-11T18:00:00.000Z", user_id: "user-1" },
      ],
      ACCOUNTS,
    );

    expect(rows.map((row) => row.player)).toEqual(["Чура", "Олюшка"]);
  });

  it("names an account with no nickname rather than dropping it", () => {
    const rows = buildCancellationRows(
      [{ cancelled_at: "2026-09-10T18:00:00.000Z", user_id: "user-3" }],
      ACCOUNTS,
    );

    expect(rows[0]?.player).toBe("Без ника");
  });

  it("ignores a row with nothing to count it by", () => {
    const rows = buildCancellationRows(
      [
        { cancelled_at: "", user_id: "user-1" },
        { cancelled_at: "2026-09-10T18:00:00.000Z", user_id: "" },
      ],
      ACCOUNTS,
    );

    expect(rows).toEqual([]);
  });
});

describe("buildCancellationsSheetGrid", () => {
  it("writes the header and the day the club reads", () => {
    const grid = buildCancellationsSheetGrid([
      { cancellations: 3, lastCancelledAt: "2026-09-18T20:30:00.000Z", player: "Чура" },
    ]);

    expect(grid[0]).toEqual(["Игрок", "Отмен", "Последняя отмена"]);
    expect(grid[1]).toEqual(["Чура", 3, "18.09.2026"]);
  });

  it("survives a date that was stored broken", () => {
    const grid = buildCancellationsSheetGrid([
      { cancellations: 1, lastCancelledAt: "не дата", player: "Чура" },
    ]);

    expect(grid[1]).toEqual(["Чура", 1, ""]);
  });

  // Blank rows follow the data so a name struck off the list is wiped from the tab
  // rather than left behind under the new last row.
  it("writes a header and blanks below it when nobody has cancelled", () => {
    const grid = buildCancellationsSheetGrid([]);

    expect(grid[0]).toEqual(["Игрок", "Отмен", "Последняя отмена"]);
    expect(grid.length).toBeGreaterThan(1);
    expect(grid.slice(1).every((row) => row.every((cell) => cell === ""))).toBe(true);
  });
});
