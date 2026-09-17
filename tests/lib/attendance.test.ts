import { describe, expect, it } from "vitest";
import { buildAttendanceRows } from "@/lib/players/attendance";
import { canonicalNicknameKey } from "@/lib/players/nickname-merges";
import { buildAttendanceSheetGrid } from "@/lib/google-sheets";

const night = (playerName: string, playedOn: string) => ({
  played_on: playedOn,
  player_key: null,
  player_name: playerName,
});

describe("buildAttendanceRows", () => {
  it("counts an evening once however many rows it left behind", () => {
    const rows = buildAttendanceRows([
      night("Karel", "2026-09-17"),
      // The same evening imported from a month sheet as well as its own game sheet.
      night("karel", "2026-09-17"),
      night("Karel", "2026-09-15"),
    ]);

    expect(rows).toEqual([
      { firstGame: "2026-09-15", lastGame: "2026-09-17", player: "Karel", visits: 2 },
    ]);
  });

  it("merges the spellings the club confirmed as one player", () => {
    const rows = buildAttendanceRows([
      night("Trusty_box", "2026-03-27"),
      night("Trusty", "2026-06-04"),
      night("Superman", "2026-03-05"),
      night("Superman (win season 1)", "2026-04-26"),
      night("Javmaz", "2026-03-11"),
      night("Javmazz", "2026-05-21"),
      night("lzya", "2026-07-16"),
      night("Олюшка", "2026-09-17"),
    ]);

    // Equal counts fall back to the nickname, and Russian collation puts Cyrillic first.
    expect(rows.map((row) => [row.player, row.visits])).toEqual([
      ["Олюшка", 2],
      ["Javmaz", 2],
      ["Superman", 2],
      ["Trusty", 2],
    ]);
  });

  it("keeps the players the club says are different apart", () => {
    const rows = buildAttendanceRows([
      night("Dan", "2026-05-28"),
      night("Danyazver", "2026-04-23"),
      night("Mark", "2026-03-05"),
      night("Mark II", "2026-04-23"),
      night("Марк II", "2026-04-12"),
      night("Mgazb", "2026-03-22"),
    ]);

    expect(rows.map((row) => [row.player, row.visits])).toEqual([
      ["Mark II", 3],
      ["Dan", 1],
      ["Danyazver", 1],
      ["Mark", 1],
    ]);
  });

  it("calls a player by the nickname their account uses now", () => {
    const rows = buildAttendanceRows(
      [night("Mr.Fish", "2026-05-24"), night("Chura", "2026-09-15")],
      [{ display_name: "Chura", nickname_key: "chura" }],
    );

    expect(rows).toEqual([
      { firstGame: "2026-05-24", lastGame: "2026-09-15", player: "Chura", visits: 2 },
    ]);
  });

  it("falls back to the spelling a guest's history uses most", () => {
    const rows = buildAttendanceRows([
      night("Стас", "2026-05-03"),
      night("СТАС", "2026-08-01"),
      night("Стас", "2026-09-17"),
    ]);

    expect(rows[0].player).toBe("Стас");
  });

  it("orders the list by evenings, then by nickname", () => {
    const rows = buildAttendanceRows([
      night("Gal", "2026-03-29"),
      night("Seller", "2026-05-28"),
      night("Seller", "2026-09-17"),
      night("Anderson", "2026-03-11"),
    ]);

    expect(rows.map((row) => row.player)).toEqual(["Seller", "Anderson", "Gal"]);
  });

  it("uses the key the database already computed, and skips a nameless row", () => {
    const rows = buildAttendanceRows([
      { played_on: "2026-09-17", player_key: "trustybox", player_name: "Trusty_box" },
      { played_on: "2026-09-15", player_key: "", player_name: "" },
    ]);

    expect(rows).toEqual([
      { firstGame: "2026-09-17", lastGame: "2026-09-17", player: "Trusty_box", visits: 1 },
    ]);
  });
});

describe("canonicalNicknameKey", () => {
  it("resolves a confirmed variant to the key the club counts it under", () => {
    expect(canonicalNicknameKey("Superman (win season 1)")).toBe("superman");
    expect(canonicalNicknameKey("Ada smasher")).toBe("adamsmasher");
    expect(canonicalNicknameKey("Юрец")).toBe("юрец67тузовски");
    expect(canonicalNicknameKey("FЁDOR")).toBe("fedor");
  });

  it("leaves a nickname of its own alone", () => {
    expect(canonicalNicknameKey("Mark")).toBe("mark");
    expect(canonicalNicknameKey("inrikki")).toBe("inrikki");
  });
});

describe("buildAttendanceSheetGrid", () => {
  it("writes the header, the rows and a blank tail", () => {
    const grid = buildAttendanceSheetGrid([
      { firstGame: "2026-03-05", lastGame: "2026-09-17", player: "inrikki", visits: 48 },
    ]);

    expect(grid[0]).toEqual(["Игрок", "Посещений", "Первая игра", "Последняя игра"]);
    expect(grid[1]).toEqual(["inrikki", 48, "2026-03-05", "2026-09-17"]);
    // The tail blanks whatever a longer previous list left behind.
    expect(grid[2]).toEqual(["", "", "", ""]);
    expect(grid).toHaveLength(52);
  });
});
