import { describe, expect, it } from "vitest";
import {
  isFirstOfMonth,
  moscowMonthName,
  pickBirthdaysThisMonth,
  pickBirthdaysToday,
  pickUpcomingBirthdaysFromAccounts,
  readBirthDay,
} from "@/lib/client-bot/birthdays";

const account = (nickname: string | null, birthDate: unknown) => ({
  display_name: nickname,
  pending_profile_answers: birthDate === undefined ? null : { birthDate },
});

// Moscow is three hours ahead, so 21:00 UTC is already the next day at the club.
const at = (iso: string) => new Date(iso);

describe("reading a birth date", () => {
  it("takes the day and the month, with or without a year", () => {
    expect(readBirthDay("14.04.1999")).toEqual({ day: 14, month: 4 });
    expect(readBirthDay("14.04")).toEqual({ day: 14, month: 4 });
    expect(readBirthDay("7.3")).toEqual({ day: 7, month: 3 });
  });

  it("refuses what is not a date", () => {
    expect(readBirthDay("24:38:56")).toBeNull();
    expect(readBirthDay("")).toBeNull();
    expect(readBirthDay(null)).toBeNull();
    expect(readBirthDay("32.01")).toBeNull();
    expect(readBirthDay("01.13")).toBeNull();
  });
});

describe("whose birthday it is today", () => {
  const roster = [
    account("kabedev", "14.04.1999"),
    account("Саймон", "14.04"),
    account("Gal", "15.04.1990"),
    account("Безымянный", undefined),
    account(null, "14.04"),
    account("Сломанный", "24:38:56"),
  ];

  it("finds everyone born on the club's today", () => {
    const found = pickBirthdaysToday(roster, at("2026-04-13T21:30:00.000Z"));

    expect(found.map((birthday) => birthday.nickname)).toEqual(["kabedev", "Саймон"]);
  });

  it("finds nobody on a day nobody was born", () => {
    expect(pickBirthdaysToday(roster, at("2026-04-16T21:30:00.000Z"))).toEqual([]);
  });

  // The cron runs at 21:00 UTC, which is already tomorrow in Moscow.
  it("counts the day the club is living, not the server's", () => {
    expect(pickBirthdaysToday(roster, at("2026-04-14T20:00:00.000Z"))).toHaveLength(2);
    expect(pickBirthdaysToday(roster, at("2026-04-14T21:00:00.000Z"))).toHaveLength(1);
  });
});

describe("the month's summary", () => {
  const roster = [
    account("Поздний", "28.09"),
    account("Ранний", "03.09.1988"),
    account("Другой месяц", "03.10"),
  ];

  it("lists the month in the order the days come round", () => {
    const found = pickBirthdaysThisMonth(roster, at("2026-09-05T12:00:00.000Z"));

    expect(found.map((birthday) => birthday.nickname)).toEqual(["Ранний", "Поздний"]);
    expect(found[0].date).toBe("03.09");
  });

  it("knows the first of a Moscow month", () => {
    expect(isFirstOfMonth(at("2026-08-31T21:30:00.000Z"))).toBe(true);
    expect(isFirstOfMonth(at("2026-08-31T20:30:00.000Z"))).toBe(false);
  });

  it("names the month the club is in", () => {
    expect(moscowMonthName(at("2026-08-31T21:30:00.000Z"))).toBe("сентябрь");
  });
});

describe("the coming birthdays", () => {
  it("puts the nearest first and drops the far ones", () => {
    const roster = [
      account("Через месяц", "20.10"),
      account("Завтра", "16.09"),
      account("Сегодня", "15.09"),
    ];

    const found = pickUpcomingBirthdaysFromAccounts(roster, at("2026-09-15T12:00:00.000Z"), 30);

    expect(found.map((birthday) => birthday.nickname)).toEqual(["Сегодня", "Завтра"]);
    expect(found[0].daysUntil).toBe(0);
    expect(found[1].daysUntil).toBe(1);
  });

  // A birthday just gone comes round again next year, not eleven months ago.
  it("looks forward past the turn of the year", () => {
    const found = pickUpcomingBirthdaysFromAccounts(
      [account("Январский", "05.01")],
      at("2026-12-28T12:00:00.000Z"),
      30,
    );

    expect(found[0].daysUntil).toBe(8);
  });
});
