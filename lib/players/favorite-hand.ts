import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { readAllPages } from "@/lib/supabase/read-all-pages";

/**
 * The two cards a player calls their own, drawn on their avatar across the app.
 *
 * Stored as four characters, rank then suit for each card in the order the player
 * picked them — "QsTs" is the queen and the ten of spades. Ten is "T", so every card
 * is two characters and the string reads back without guessing.
 */
export const HAND_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const HAND_SUITS = ["s", "h", "d", "c"] as const;

export type HandRank = (typeof HAND_RANKS)[number];
export type HandSuit = (typeof HAND_SUITS)[number];
export type HandCard = { rank: HandRank; suit: HandSuit };

export const SUIT_SYMBOLS: Record<HandSuit, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };

const HAND_PATTERN = /^([2-9TJQKA][shdc])([2-9TJQKA][shdc])$/;

/** Hearts and diamonds are printed red, spades and clubs black. */
export function isRedSuit(suit: HandSuit) {
  return suit === "h" || suit === "d";
}

/** The rank as the card shows it: the ten is written out. */
export function formatRank(rank: HandRank) {
  return rank === "T" ? "10" : rank;
}

function readCard(code: string): HandCard {
  return { rank: code[0] as HandRank, suit: code[1] as HandSuit };
}

/** The two cards of a stored hand, or null for anything that is not a hand. */
export function parseFavoriteHand(value: unknown): [HandCard, HandCard] | null {
  if (typeof value !== "string") return null;

  const match = value.match(HAND_PATTERN);
  // The same card twice is not a hand anybody can hold.
  if (!match || match[1] === match[2]) return null;

  return [readCard(match[1]), readCard(match[2])];
}

export function formatFavoriteHand(cards: readonly [HandCard, HandCard]) {
  return cards.map((card) => `${card.rank}${card.suit}`).join("");
}

export type HandLookup = {
  /** The hand of one player as a list spells them: by Telegram id, then by nickname. */
  find: (player: { name?: string | null; telegramId?: number | null }) => string | null;
};

const NO_HANDS: HandLookup = { find: () => null };

type HandRow = { display_name: string | null; favorite_hand: string | null; telegram_id: number | null };

/**
 * Everybody's hand, for a list of players to draw.
 *
 * Only the accounts that picked one are read — a few dozen rows — so a list can ask on
 * every open and a hand changed a minute ago is already there. The column arrives with a
 * migration applied by hand: until it is, the read fails and the lists simply show no
 * hands, faces and all else as before.
 */
export async function loadFavoriteHands(supabase: SupabaseClient): Promise<HandLookup> {
  let rows: HandRow[];
  try {
    rows = await readAllPages<HandRow>((from, to) =>
      supabase
        .from("client_bot_users")
        .select("telegram_id, display_name, favorite_hand")
        .not("favorite_hand", "is", null)
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    console.warn("Favorite hands are unavailable", error);
    return NO_HANDS;
  }

  const byTelegramId = new Map<number, string>();
  const byNickname = new Map<string, string>();

  for (const row of rows) {
    if (!parseFavoriteHand(row.favorite_hand)) continue;

    const hand = row.favorite_hand as string;
    if (row.telegram_id !== null) byTelegramId.set(Number(row.telegram_id), hand);
    const nickname = buildNicknameKey(row.display_name ?? "");
    if (nickname) byNickname.set(nickname, hand);
  }

  return {
    find: ({ name, telegramId }) =>
      (telegramId ? byTelegramId.get(Number(telegramId)) : undefined) ??
      byNickname.get(buildNicknameKey(name ?? "")) ??
      null,
  };
}

/**
 * One account's hand, read apart so a missing column never costs the rest of a page.
 * The hand is decoration: whatever goes wrong reading it, the page opens without it.
 */
export async function readFavoriteHand(
  supabase: SupabaseClient,
  accountId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("client_bot_users")
      .select("favorite_hand")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      console.warn("Favorite hand is unavailable", error.message);
      return null;
    }

    const hand = (data as { favorite_hand?: unknown } | null)?.favorite_hand;
    return parseFavoriteHand(hand) ? (hand as string) : null;
  } catch (error) {
    console.warn("Favorite hand is unavailable", error);
    return null;
  }
}
