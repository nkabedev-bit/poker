import { describe, expect, it } from "vitest";
import { findDuplicateResults, type StoredResultRow } from "@/lib/results/duplicate-results";

function row(overrides: Partial<StoredResultRow> & { id: string }): StoredResultRow {
  return {
    countsForRating: true,
    createdAt: "2026-09-01T10:00:00.000Z",
    place: 5,
    playerName: "Maks B",
    startedAt: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("findDuplicateResults", () => {
  it("finds an evening stored twice under two spellings of one nickname", () => {
    const groups = findDuplicateResults([
      row({ id: "a" }),
      row({ countsForRating: false, id: "b", place: null, playerName: "MaksB" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].keep.id).toBe("a");
    expect(groups[0].remove.map((item) => item.id)).toEqual(["b"]);
  });

  it("keeps the row that knows the finishing place", () => {
    const groups = findDuplicateResults([
      row({ createdAt: "2026-08-01T10:00:00.000Z", id: "withPlace" }),
      row({ id: "noPlace", place: null, playerName: "maks_b" }),
    ]);

    expect(groups[0].keep.id).toBe("withPlace");
  });

  it("keeps the game that counts for the rating when neither has a place", () => {
    const groups = findDuplicateResults([
      row({ countsForRating: false, id: "fun", place: null }),
      row({ countsForRating: true, id: "rated", place: null, playerName: "MAKS B" }),
    ]);

    expect(groups[0].keep.id).toBe("rated");
  });

  it("leaves two tournaments played on one day alone", () => {
    const groups = findDuplicateResults([
      row({ id: "day", startedAt: "2026-07-10T12:00:00.000Z" }),
      row({ id: "evening", playerName: "maksb", startedAt: "2026-07-10T19:00:00.000Z" }),
    ]);

    expect(groups).toEqual([]);
  });

  it("leaves two different players alone", () => {
    expect(
      findDuplicateResults([row({ id: "a" }), row({ id: "b", playerName: "TitAn" })]),
    ).toEqual([]);
  });

  it("collapses three spellings into one survivor and two removals", () => {
    const groups = findDuplicateResults([
      row({ id: "a", place: null, countsForRating: false }),
      row({ id: "b", place: null, countsForRating: false, playerName: "MaksB" }),
      row({ id: "c", playerName: "maks b" }),
    ]);

    expect(groups[0].keep.id).toBe("c");
    expect(groups[0].remove.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });
});
