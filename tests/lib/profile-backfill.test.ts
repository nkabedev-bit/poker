import { describe, expect, it } from "vitest";
import { readSheetProfiles } from "@/lib/client-bot/profile-backfill";

const HEADER = [
  "Дата заполнения", "Telegram username", "Telegram ID", "Имя Фамилия",
  "Игровой никнейм", "Номер телефона", "Дата рождения",
];

const row = (nickname: string, birthDate: string, phone = "79114384108", name = "Никита К") =>
  ["19.05.2026", "@kabedev", "511564749", name, nickname, phone, birthDate];

describe("carrying the old questionnaires out of the sheet", () => {
  it("reads the nickname, the date, the phone and the name", () => {
    expect(readSheetProfiles([HEADER, row("kabedev", "14.04")])).toEqual([
      {
        birthDate: "14.04",
        fullName: "Никита К",
        nicknameKey: "kabedev",
        phone: "79114384108",
      },
    ]);
  });

  it("pads a date the club typed short", () => {
    expect(readSheetProfiles([HEADER, row("gal", "7.3")])[0].birthDate).toBe("07.03");
  });

  it("reads a date written out in words", () => {
    expect(readSheetProfiles([HEADER, row("gal", "7 марта")])[0].birthDate).toBe("07.03");
  });

  // The spreadsheet turns some of these into a time, or a number, or nothing at all.
  it("skips a cell the spreadsheet mangled", () => {
    expect(readSheetProfiles([HEADER, row("саймон", "24:38:56")])).toEqual([]);
    expect(readSheetProfiles([HEADER, row("саймон", "")])).toEqual([]);
  });

  it("skips a row with no nickname", () => {
    expect(readSheetProfiles([HEADER, row("", "14.04")])).toEqual([]);
  });

  // The club writes a nickname as it pleases, and the key is what matches it.
  it("matches a nickname however it was typed", () => {
    expect(readSheetProfiles([HEADER, row("MDG-Killer", "14.04")])[0].nicknameKey).toBe(
      "mdgkiller",
    );
  });

  // Two questionnaires under one nickname: the first is the one the club plays under.
  it("keeps the first of two questionnaires", () => {
    const profiles = readSheetProfiles([HEADER, row("gal", "14.04"), row("Gal", "01.01")]);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].birthDate).toBe("14.04");
  });

  it("reads nothing out of an empty sheet", () => {
    expect(readSheetProfiles([])).toEqual([]);
    expect(readSheetProfiles([HEADER])).toEqual([]);
  });
});
