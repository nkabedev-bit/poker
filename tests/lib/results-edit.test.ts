import { describe, expect, it } from "vitest";
import { normalizeEditedRows, ResultEditError } from "@/lib/results/edit";

function row(overrides: Record<string, unknown> = {}) {
  return { knockouts: "0", place: "1", playerName: "Ace", points: "100", telegramId: null, ...overrides };
}

describe("normalizeEditedRows", () => {
  it("reads the numbers an admin typed into the grid", () => {
    const [result] = normalizeEditedRows([row({ knockouts: "2.5", place: "3", points: "80" })]);

    expect(result).toMatchObject({ knockouts: 2.5, place: 3, points: 80 });
  });

  it("orders the table by place", () => {
    const rows = normalizeEditedRows([
      row({ place: "3", playerName: "Третий" }),
      row({ place: "1", playerName: "Первый" }),
    ]);

    expect(rows.map((item) => item.playerName)).toEqual(["Первый", "Третий"]);
  });

  it("drops a row left blank", () => {
    expect(normalizeEditedRows([row(), row({ place: "", playerName: "  " })])).toHaveLength(1);
  });

  it("keeps a player who finished outside the scoring places", () => {
    const [result] = normalizeEditedRows([row({ place: "", points: "0" })]);

    expect(result.place).toBeNull();
  });

  // Two rows for one player would count their evening twice in the month.
  it("refuses the same player twice, whatever the case", () => {
    expect(() => normalizeEditedRows([row({ playerName: "Ace" }), row({ place: "2", playerName: "ace" })]))
      .toThrow(ResultEditError);
  });

  it("refuses two players on one place", () => {
    expect(() => normalizeEditedRows([row({ playerName: "Первый" }), row({ playerName: "Второй" })]))
      .toThrow(ResultEditError);
  });

  it("rejects a place that is not a place at all", () => {
    expect(() => normalizeEditedRows([row({ place: "0" })])).toThrow();
    expect(() => normalizeEditedRows([row({ place: "-3" })])).toThrow();
  });

  it("keeps the account so a corrected row still reaches the right profile", () => {
    const [result] = normalizeEditedRows([row({ telegramId: 42 })]);

    expect(result.telegramId).toBe(42);
  });
});
