import { describe, expect, it } from "vitest";
import {
  findMonthSheetHeaders,
  isMonthSheetName,
  scoreMonthRows,
  parseGameSheetDate,
  parseGameStandings,
  parseMonthSheetKey,
  parseMonthStandings,
  parseSheetPeriod,
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

  // In standard bounty the knockout points are already inside PTS, and the neighbouring
  // column counts heads — adding it would count the knockouts as points.
  it("does not add the knockout count to the points in standard bounty", () => {
    expect(parseGameStandings(standard)[0].points).toBe(100);
  });

  // Mystery, dealer, wanted and progressive report knockout points separately, and the
  // club counts them towards the total.
  it("sums place points and knockout points in the side-points modes", () => {
    const wide = [
      ["Место", "Игрок", "PTS", "Mystery-Points", "Кол-во выбиваний"],
      [1, "Первый", 100, 250, 4],
    ];

    expect(parseGameStandings(wide)[0]).toMatchObject({ knockouts: 4, points: 350 });
  });

  it("recognises every name the side-points column goes by", () => {
    for (const heading of ["Очки за дилера", "Wanted PTS", "Очки за баунти"]) {
      const rows = parseGameStandings([
        ["Место", "Игрок", "PTS", heading, "Кол-во выбиваний"],
        [1, "Первый", 100, 60, 2],
      ]);

      expect(rows[0]).toMatchObject({ knockouts: 2, points: 160 });
    }
  });

  // Sheets drops trailing empty cells, so the header can arrive shorter than the rows.
  // Reading knockouts by position there took the points column instead.
  it("keeps the columns straight when the header row is truncated", () => {
    const truncated = [
      ["Место", "Игрок", "PTS"],
      [1, "Первый", 100, 250, 4],
    ];

    expect(parseGameStandings(truncated)[0]).toMatchObject({ knockouts: 4, points: 350 });
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

describe("parseSheetPeriod", () => {
  it("reads a plain month sheet as itself", () => {
    expect(parseSheetPeriod("СЕНТЯБРЬ", 2026)).toMatchObject({
      coveredMonths: ["2026-09"],
      key: "2026-09",
    });
  });

  // The club's first two seasons ran across two months and are titled that way; reading
  // only the first month would file the season under March and lose the season itself.
  it("keeps a two-month season as one period", () => {
    expect(parseSheetPeriod("Сезон 1 (март-апрель)", 2026)).toEqual({
      coveredMonths: ["2026-03", "2026-04"],
      key: "season-1",
      label: "Сезон 1",
    });
  });

  it("numbers each season separately", () => {
    expect(parseSheetPeriod("Сезон 2 (апрель-май)", 2026)).toMatchObject({
      coveredMonths: ["2026-04", "2026-05"],
      key: "season-2",
      label: "Сезон 2",
    });
  });

  it("takes the year written on the sheet", () => {
    expect(parseSheetPeriod("Сезон 1 (март-апрель) 2025", 2026)?.coveredMonths).toEqual([
      "2025-03",
      "2025-04",
    ]);
  });

  it("ignores a sheet that names no period at all", () => {
    expect(parseSheetPeriod("система рейтинга", 2026)).toBeNull();
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

    expect(rows).toMatchObject([
      { knockouts: 139, playerName: "Подпольный", points: 17290 },
      { knockouts: 73, playerName: "Даниил", points: 10770 },
    ]);
  });

  // Sheets name the score column whatever they like: "Итоговая сумма" is the same
  // thing as "Очки", and missing it threw a whole month away.
  it("recognises the score column under any of its names", () => {
    for (const heading of ["Очки", "Рейтинг", "Итоговая сумма", "PTS"]) {
      const rows = parseMonthStandings([
        ["Ник игрока", heading, "БАУНТИ"],
        ["Ace", 500, 12],
      ]);

      expect(rows).toMatchObject([{ knockouts: 12, playerName: "Ace", points: 500 }]);
    }
  });

  it("reads a sheet whose game dates follow the totals", () => {
    const rows = parseMonthStandings([
      ["Ник игрока", "Итоговая сумма", "БАУНТИ", "4.6.26", "07.06.26"],
      ["Seller", 720, 8, 120, 90],
    ]);

    expect(rows).toMatchObject([{ knockouts: 8, playerName: "Seller", points: 720 }]);
  });

  it("works without a knockout column", () => {
    const rows = parseMonthStandings([
      ["Игрок", "Очки"],
      ["Ace", 500],
    ]);

    expect(rows).toMatchObject([{ knockouts: 0, playerName: "Ace", points: 500 }]);
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

describe("choosing which column scores", () => {
  const sheet = [
    ["Ник игрока", "Итоговая сумма", "Зачёт (топ-5)", "БАУНТИ"],
    ["inrikki", 1348, 1215, 5],
  ];

  // A club sheet often carries both a running total of every game and the figure that
  // actually counted; only the club knows which is which.
  it("picks a column by its heading when told to", () => {
    expect(parseMonthStandings(sheet, "Зачёт (топ-5)")[0].points).toBe(1215);
  });

  it("falls back to its own choice when the heading is unknown", () => {
    expect(parseMonthStandings(sheet, "Такой колонки нет")[0].points).toBe(1348);
  });

  it("lists the headings a sheet offers", () => {
    expect(findMonthSheetHeaders(sheet)).toEqual([
      "Ник игрока",
      "Итоговая сумма",
      "Зачёт (топ-5)",
      "БАУНТИ",
    ]);
  });
});


describe("scoring a sheet by the season's rule", () => {
  // The real shape of a club season sheet: a column per game night, then a running
  // total the club does not actually score by.
  const sheet = [
    ["Ник игрока", "5.3.26", "11.3.26", "19.3.26", "29.03.26", "01.04.26", "05.04.26", "9.4.26", "12.4.26", "16.04.26", "Итоговая сумма"],
    ["inrikki", 50, 18, 85, 15, 405, 150, 520, 55, 50, 1348],
  ];

  it("collects what a player scored on each night", () => {
    expect(parseMonthStandings(sheet)[0].gamePoints).toEqual([50, 18, 85, 15, 405, 150, 520, 55, 50]);
  });

  // 520 + 405 + 150 + 85 + 55 — the figure the club published, against a 1348 total.
  it("scores the best five nights when the season counts five", () => {
    const rows = scoreMonthRows(parseMonthStandings(sheet), 5);

    expect(rows[0].points).toBe(1215);
  });

  it("leaves the sheet's own total alone when every game counts", () => {
    expect(scoreMonthRows(parseMonthStandings(sheet), null)[0].points).toBe(1348);
  });

  it("counts what there is when a player played fewer nights than the rule", () => {
    const rows = scoreMonthRows(
      parseMonthStandings([
        ["Ник игрока", "5.3.26", "11.3.26", "Итоговая сумма"],
        ["Новичок", 100, 50, 150],
      ]),
      5,
    );

    expect(rows[0].points).toBe(150);
  });

  it("ignores columns that are not game nights", () => {
    const rows = parseMonthStandings([
      ["Ник игрока", "5.3.26", "Итоговая сумма", "МЕСТО ПО ТОП-5 ИГР"],
      ["inrikki", 50, 1348, 3],
    ]);

    expect(rows[0].gamePoints).toEqual([50]);
  });
});
