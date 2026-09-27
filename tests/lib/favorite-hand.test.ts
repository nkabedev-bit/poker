import { describe, expect, it, vi } from "vitest";
import {
  formatFavoriteHand,
  formatRank,
  isRedSuit,
  loadFavoriteHands,
  parseFavoriteHand,
  readFavoriteHand,
} from "@/lib/players/favorite-hand";

describe("parseFavoriteHand", () => {
  it("reads the two cards in the order the player picked them", () => {
    expect(parseFavoriteHand("QsTs")).toEqual([
      { rank: "Q", suit: "s" },
      { rank: "T", suit: "s" },
    ]);
    expect(parseFavoriteHand("2c7h")).toEqual([
      { rank: "2", suit: "c" },
      { rank: "7", suit: "h" },
    ]);
  });

  it("refuses anything that is not two different cards", () => {
    for (const value of ["QsQs", "10sTs", "qsTs", "Qs", "QsTsAh", "QxTs", "", null, 42, undefined]) {
      expect(parseFavoriteHand(value)).toBeNull();
    }
  });

  it("writes a hand back the way it is stored", () => {
    const hand = parseFavoriteHand("AhKd");
    expect(hand && formatFavoriteHand(hand)).toBe("AhKd");
  });
});

describe("how a card is printed", () => {
  it("writes the ten out and keeps the other ranks", () => {
    expect(formatRank("T")).toBe("10");
    expect(formatRank("Q")).toBe("Q");
    expect(formatRank("7")).toBe("7");
  });

  it("prints hearts and diamonds red, spades and clubs black", () => {
    expect(isRedSuit("h")).toBe(true);
    expect(isRedSuit("d")).toBe(true);
    expect(isRedSuit("s")).toBe(false);
    expect(isRedSuit("c")).toBe(false);
  });
});

/** The accounts table answering the one read the hands make, a page at a time. */
function accountsWithHands(rows: unknown[] | Error) {
  const range = vi.fn(async () =>
    rows instanceof Error ? { data: null, error: rows } : { data: rows, error: null },
  );
  const chain = { not: vi.fn(() => chain), order: vi.fn(() => chain), range, select: vi.fn(() => chain) };

  return { from: vi.fn(() => chain) } as never;
}

describe("loadFavoriteHands", () => {
  it("finds a hand by Telegram id first, then by nickname", async () => {
    const hands = await loadFavoriteHands(
      accountsWithHands([
        { display_name: "Chura", favorite_hand: "QsTs", telegram_id: 101 },
        { display_name: "Олюшка", favorite_hand: "AhAd", telegram_id: null },
      ]),
    );

    expect(hands.find({ name: "Кто-то другой", telegramId: 101 })).toBe("QsTs");
    expect(hands.find({ name: "ОЛЮШКА" })).toBe("AhAd");
    expect(hands.find({ name: "Vera", telegramId: 555 })).toBeNull();
  });

  it("leaves out a stored value that is not a hand", async () => {
    const hands = await loadFavoriteHands(
      accountsWithHands([{ display_name: "Chura", favorite_hand: "QsQs", telegram_id: 101 }]),
    );

    expect(hands.find({ name: "Chura", telegramId: 101 })).toBeNull();
  });

  // Until the migration is applied the column is not there, and lists go on without hands.
  it("shows no hands when they cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hands = await loadFavoriteHands(
      accountsWithHands(new Error('column client_bot_users.favorite_hand does not exist')),
    );

    expect(hands.find({ name: "Chura", telegramId: 101 })).toBeNull();
    warn.mockRestore();
  });
});

describe("readFavoriteHand", () => {
  function account(result: { data: unknown; error: unknown }) {
    const chain = {
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => result),
      select: vi.fn(() => chain),
    };
    return { from: vi.fn(() => chain) } as never;
  }

  it("reads one account's hand", async () => {
    expect(
      await readFavoriteHand(account({ data: { favorite_hand: "KcKd" }, error: null }), "a1"),
    ).toBe("KcKd");
    expect(await readFavoriteHand(account({ data: { favorite_hand: null }, error: null }), "a1")).toBeNull();
  });

  it("answers null rather than failing the page when the column is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      await readFavoriteHand(account({ data: null, error: { message: "column does not exist" } }), "a1"),
    ).toBeNull();
    warn.mockRestore();
  });
});
