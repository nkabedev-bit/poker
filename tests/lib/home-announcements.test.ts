import { describe, expect, it } from "vitest";
import {
  HOME_ANNOUNCEMENTS_LIMIT,
  isHomeAnnouncementShown,
  parseHomeAnnouncementsInput,
} from "@/lib/client/home-announcements";

const SAVED_ID = "6f1c2a10-3d4e-4f50-8a6b-7c8d9e0f1a2b";

function parseOne(card: Record<string, unknown>) {
  return parseHomeAnnouncementsInput({ items: [card] });
}

describe("reading the cards the desk saves", () => {
  it("keeps a saved card's id and trims its text", () => {
    const parsed = parseOne({ id: SAVED_ID, linkUrl: "", message: "  Турнир в пятницу  " });

    expect(parsed).toEqual({
      items: [{ id: SAVED_ID, linkUrl: null, message: "Турнир в пятницу", showUntil: null }],
    });
  });

  // The desk copies post links from Telegram, and those come without the scheme.
  it("gives a bare t.me link its https back", () => {
    const parsed = parseOne({ linkUrl: "t.me/majesticpokerptz/1197", message: "Сочи" });

    expect(parsed).toMatchObject({ items: [{ linkUrl: "https://t.me/majesticpokerptz/1197" }] });
  });

  // The link lands in an href and in Telegram's opener; nothing but a web address may.
  it.each(["javascript:alert(1)", "mailto:club@example.com", "tg://resolve?domain=club"])(
    "refuses %s as a link",
    (linkUrl) => {
      expect(parseOne({ linkUrl, message: "Текст" })).toEqual({
        error: "Объявление 1: ссылка должна начинаться с https://",
      });
    },
  );

  it("refuses a link that is not an address", () => {
    expect(parseOne({ linkUrl: "просто слово", message: "Текст" })).toEqual({
      error: "Объявление 1: ссылка не похожа на адрес сайта",
    });
  });

  it("names the card by its place when its text is empty", () => {
    const parsed = parseHomeAnnouncementsInput({
      items: [{ message: "Первое" }, { message: "   " }],
    });

    expect(parsed).toEqual({ error: "Объявление 2: пустой текст" });
  });

  it("refuses text past five hundred characters", () => {
    expect(parseOne({ message: "а".repeat(501) })).toEqual({
      error: "Объявление 1: текст длиннее 500 символов",
    });
  });

  it("stores the end of showing as UTC", () => {
    const parsed = parseOne({ message: "Сочи", showUntil: "2026-11-20T00:00:00+03:00" });

    expect(parsed).toMatchObject({ items: [{ showUntil: "2026-11-19T21:00:00.000Z" }] });
  });

  it("refuses an end of showing it cannot read", () => {
    expect(parseOne({ message: "Сочи", showUntil: "в ноябре" })).toEqual({
      error: "Объявление 1: непонятная дата окончания показа",
    });
  });

  // A forged or repeated id must not overwrite another card.
  it("treats an unknown or repeated id as a new card", () => {
    const parsed = parseHomeAnnouncementsInput({
      items: [
        { id: SAVED_ID, message: "Первое" },
        { id: SAVED_ID, message: "Копия" },
        { id: "1; drop table", message: "Третье" },
      ],
    });

    expect(parsed).toMatchObject({ items: [{ id: SAVED_ID }, { id: null }, { id: null }] });
  });

  it(`keeps the carousel to ${HOME_ANNOUNCEMENTS_LIMIT} cards`, () => {
    const items = Array.from({ length: HOME_ANNOUNCEMENTS_LIMIT + 1 }, () => ({ message: "Карточка" }));

    expect(parseHomeAnnouncementsInput({ items })).toEqual({ error: "Не больше 10 объявлений" });
  });

  it("refuses a body without a list", () => {
    expect(parseHomeAnnouncementsInput(null)).toEqual({ error: "Нет списка объявлений" });
  });
});

describe("which cards players see", () => {
  const now = new Date("2026-11-19T20:59:00.000Z");

  it("shows a card without an end for good", () => {
    expect(isHomeAnnouncementShown({ showUntil: null }, now)).toBe(true);
  });

  it("shows a card until its end", () => {
    expect(isHomeAnnouncementShown({ showUntil: "2026-11-19T21:00:00.000Z" }, now)).toBe(true);
  });

  it("hides it from its end on", () => {
    const atTheEnd = new Date("2026-11-19T21:00:00.000Z");

    expect(isHomeAnnouncementShown({ showUntil: "2026-11-19T21:00:00.000Z" }, atTheEnd)).toBe(false);
  });
});
