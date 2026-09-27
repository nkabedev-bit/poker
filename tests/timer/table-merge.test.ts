import { describe, expect, it } from "vitest";
import { describeTableMove, isTableMerge, TABLE_MERGE_NOTICE } from "@/lib/timer/table-merge";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";
import {
  defaultTournamentExtras,
  mergeTournamentExtras,
} from "@/lib/tournament-extras-shared";

describe("isTableMerge", () => {
  it("accepts an announcement with a real start time", () => {
    expect(isTableMerge({ startedAt: "2026-09-09T20:15:00.000Z" })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTableMerge(null)).toBe(false);
    expect(isTableMerge(true)).toBe(false);
    expect(isTableMerge({})).toBe(false);
    expect(isTableMerge({ startedAt: 1757448900000 })).toBe(false);
    expect(isTableMerge({ startedAt: "позавчера" })).toBe(false);
  });
});

describe("tableMerge in stored extras", () => {
  it("is off by default", () => {
    expect(defaultTournamentExtras.tableMerge).toBeNull();
    expect(mergeTournamentExtras({}).tableMerge).toBeNull();
  });

  it("survives a round trip through stored JSON", () => {
    const tableMerge = { startedAt: "2026-09-09T20:15:00.000Z" };

    expect(mergeTournamentExtras({ tableMerge }).tableMerge).toEqual(tableMerge);
  });

  it("keeps a broken record off the screens", () => {
    expect(mergeTournamentExtras({ tableMerge: { startedAt: "" } }).tableMerge).toBeNull();
    expect(mergeTournamentExtras({ tableMerge: "yes" }).tableMerge).toBeNull();
  });

  it("carries the moves of a broken table through stored JSON", () => {
    const tableMerge = {
      brokenTable: 3,
      moves: [{ name: "Chura", playerId: "p1", seat: 3, seatLabel: "3", table: 1 }],
      startedAt: "2026-09-27T20:15:00.000Z",
    };

    expect(mergeTournamentExtras({ tableMerge }).tableMerge).toEqual(tableMerge);
  });

  // A move without a table or a chair would send somebody nowhere on the big screen.
  it("drops a move the screen could not read out", () => {
    const good = { name: "Chura", playerId: "p1", seat: 3, seatLabel: "3", table: 1 };

    expect(
      mergeTournamentExtras({
        tableMerge: {
          brokenTable: "три",
          moves: [
            good,
            { ...good, table: 0 },
            { ...good, seat: null },
            { ...good, name: "  " },
            "Олюшка за второй",
          ],
          startedAt: "2026-09-27T20:15:00.000Z",
        },
      }).tableMerge,
    ).toEqual({ moves: [good], startedAt: "2026-09-27T20:15:00.000Z" });
  });

  it("is cleared at the finish, so the next tournament starts with clean screens", () => {
    expect(getFinishTournamentExtrasPatch().tableMerge).toBeNull();
  });
});

describe("describeTableMove", () => {
  it("reads a move out the way the room hears it", () => {
    expect(
      describeTableMove({ name: "Chura", playerId: "p1", seat: 3, seatLabel: "3", table: 1 }),
    ).toBe("Chura пересаживается за стол 1, место 3");
  });

  it("names a short-handed chair by both of its places", () => {
    expect(
      describeTableMove({ name: "Олюшка", playerId: "p2", seat: 2, seatLabel: "2/3", table: 2 }),
    ).toBe("Олюшка пересаживается за стол 2, место 2/3");
  });
});

describe("TABLE_MERGE_NOTICE", () => {
  it("tells the room what to do and what happens next", () => {
    expect(TABLE_MERGE_NOTICE.title).toBe("ОБЪЕДИНЕНИЕ СТОЛОВ");
    expect(TABLE_MERGE_NOTICE.detail).toContain("Заканчиваем раздачу");
    expect(TABLE_MERGE_NOTICE.detail).toContain("пересадка");
  });
});
