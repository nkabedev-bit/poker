import { describe, expect, it } from "vitest";
import {
  isMonthSheetName,
  parseGameSheetDate,
  parseGameStandings,
  parseMonthSheetKey,
  parseMonthStandings,
} from "@/lib/sheets-import/parse-sheets";

describe("parseGameSheetDate", () => {
  it("reads the date a game sheet is named after", () => {
    expect(parseGameSheetDate("01/09", 2026)).toBe("2026-09-01");
    expect(parseGameSheetDate("7.3", 2025)).toBe("2025-03-07");
  });

  it("prefers a year written on the sheet itself", () => {
    expect(parseGameSheetDate("01/09/2024", 2026)).toBe("2024-09-01");
    expect(parseGameSheetDate("01/09/24", 2026)).toBe("2024-09-01");
  });

  it("ignores sheets that are not games", () => {
    expect(parseGameSheetDate("VIP", 2026)).toBeNull();
    expect(parseGameSheetDate("анкеты", 2026)).toBeNull();
    expect(parseGameSheetDate("40/13", 2026)).toBeNull();
  });
});

describe("parseGameStandings", () => {
  const standard = [
    ["Место", "Игрок", "PTS", "Кол-во баунти"],
    [1, "Первый", 100, 3],
    [2, "Второй", "80", "1,5"],
    [3, "", "", ""],
  ];

  it("reads place, player, points and knockouts", () => {
    expect(parseGameStandings(standard)).toEqual([
      { knockouts: 3, place: 1, playerName: "Первый", points: 100 },
      { knockouts: 1.5, place: 2, playerName: "Второй", points: 80 },
    ]);
  });

  // Mystery and dealer modes add a column, pushing the knockout count to the end.
  it("takes knockouts from the last column in the wide layout", () => {
    const wide = [
      ["Место", "Игрок", "PTS", "Mystery-Points", "Кол-во выбиваний"],
      [1, "Первый", 100, 250, 4],
    ];

    expect(parseGameStandings(wide)[0]).toMatchObject({ knockouts: 4, points: 100 });
  });

  it("skips the padding rows the sheet is filled with", () => {
    expect(parseGameStandings([standard[0], ["", "", "", ""]])).toEqual([]);
  });
});

describe("isMonthSheetName", () => {
  it("accepts the month sheets", () => {
    expect(isMonthSheetName("СЕНТЯБРЬ")).toBe(true);
    expect(isMonthSheetName("Август 2026")).toBe(true);
    expect(isMonthSheetName("09.2026")).toBe(true);
  });

  it("rejects the sheets the club asked to leave alone", () => {
    expect(isMonthSheetName("система рейтинга")).toBe(false);
    expect(isMonthSheetName("VIP LEAGUE")).toBe(false);
  });
});

describe("parseMonthSheetKey", () => {
  it("turns a month name into the key the app filters by", () => {
    expect(parseMonthSheetKey("СЕНТЯБРЬ", 2026)).toBe("2026-09");
    expect(parseMonthSheetKey("Август 2025", 2026)).toBe("2025-08");
  });

  it("handles both numeric spellings", () => {
    expect(parseMonthSheetKey("09.2026", 2026)).toBe("2026-09");
    expect(parseMonthSheetKey("2026-09", 2026)).toBe("2026-09");
  });

  it("reads May under either spelling", () => {
    expect(parseMonthSheetKey("май", 2026)).toBe("2026-05");
    expect(parseMonthSheetKey("мая", 2026)).toBe("2026-05");
  });
});

describe("parseMonthStandings", () => {
  it("finds the columns by their headings, wherever they sit", () => {
    const rows = parseMonthStandings([
      ["Рейтинг сентября", "", ""],
      ["Место", "Никнейм", "Нокауты", "Очки"],
      [1, "Подпольный", 139, 17290],
      [2, "Даниил", 73, "10 770"],
    ]);

    expect(rows).toEqual([
      { knockouts: 139, playerName: "Подпольный", points: 17290 },
      { knockouts: 73, playerName: "Даниил", points: 10770 },
    ]);
  });

  it("works without a knockout column", () => {
    const rows = parseMonthStandings([
      ["Игрок", "Очки"],
      ["Ace", 500],
    ]);

    expect(rows).toEqual([{ knockouts: 0, playerName: "Ace", points: 500 }]);
  });

  it("returns nothing when the sheet has no player column at all", () => {
    expect(parseMonthStandings([["Что-то", "Другое"], [1, 2]])).toEqual([]);
  });

  it("drops rows without a player", () => {
    const rows = parseMonthStandings([
      ["Игрок", "Очки"],
      ["", 500],
      ["Ace", 100],
    ]);

    expect(rows).toHaveLength(1);
  });
});
