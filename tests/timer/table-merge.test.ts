import { describe, expect, it } from "vitest";
import { isTableMerge, TABLE_MERGE_NOTICE } from "@/lib/timer/table-merge";
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

  it("is cleared at the finish, so the next tournament starts with clean screens", () => {
    expect(getFinishTournamentExtrasPatch().tableMerge).toBeNull();
  });
});

describe("TABLE_MERGE_NOTICE", () => {
  it("tells the room what to do and what happens next", () => {
    expect(TABLE_MERGE_NOTICE.title).toBe("ОБЪЕДИНЕНИЕ СТОЛОВ");
    expect(TABLE_MERGE_NOTICE.detail).toContain("Заканчиваем раздачу");
    expect(TABLE_MERGE_NOTICE.detail).toContain("пересадка");
  });
});
