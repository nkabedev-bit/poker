import { CARD_NUMBER_WIDTH } from "@/lib/cards/card-batch";
import { buildPlayerCharge, type FinancePrices, type PlayerCharge } from "@/lib/finance/player-charge";
import type { TournamentPlayer } from "@/lib/timer/types";

export type TicketType = "regular" | "vip";

/**
 * What the admin sees after scanning a card. No prices: the club reads the composition
 * off the screen and takes payment at the desk.
 */
export type CardSession = {
  addons: number;
  /** Empty on an evening played without cards; the player is found by name instead. */
  cardCode: string;
  /** Whether the player has already been knocked out — they may still owe for the night. */
  eliminated: boolean;
  /** Who this is, which is what the desk works by when no card was handed over. */
  playerId: string;
  /** What the player owes for the evening, line by line. */
  charge: PlayerCharge;
  doubleReentries: number;
  /** The entry was covered by a free pass — nothing to take for the ticket. */
  freePass: boolean;
  /** The player has settled up for the evening. */
  paid: boolean;
  name: string;
  registrationNumber: number | null;
  reentries: number;
  /** The chair the player was given, so the desk can point at it. */
  seat: number | null;
  table: number | null;
  ticketType: TicketType;
};

/** Every card the club prints carries this prefix, so the admin only types the number. */
export const CARD_CODE_PREFIX = "MJ";

/** Guest cards are a run of their own: MJ-001 and G-001 are two different cards. */
export const GUEST_CARD_CODE_PREFIX = "G";

/** The packs the desk hands out, in the order the prefix picker offers them. */
export const CARD_CODE_PREFIXES = [CARD_CODE_PREFIX, GUEST_CARD_CODE_PREFIX] as const;

export type CardCodePrefix = (typeof CARD_CODE_PREFIXES)[number];

/**
 * The code behind the digits an admin typed. Numbers are padded the way the batches are
 * printed: card 2 is MJ-002, card 1000 stays MJ-1000.
 */
export function buildCardCodeFromDigits(digits: string, prefix = CARD_CODE_PREFIX) {
  const number = digits.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!number) return "";

  return `${prefix}-${number.padStart(CARD_NUMBER_WIDTH, "0")}`;
}

/** Codes are printed on the cards; scanning brings back whatever the QR holds. */
export function normalizeCardCode(value: unknown) {
  return String(value ?? "").trim().slice(0, 64);
}

export function isTicketType(value: unknown): value is TicketType {
  return value === "regular" || value === "vip";
}

export function buildCardSession(
  player: TournamentPlayer,
  cardCode: string,
  prices: FinancePrices,
  options: { freeroll?: boolean } = {},
): CardSession {
  const rebuys = Math.max(0, Number(player.rebuys ?? 0));
  const doubleRebuys = Math.max(0, Number(player.doubleRebuys ?? 0));

  return {
    addons: Math.max(0, Number(player.addons ?? 0)),
    cardCode,
    eliminated: player.status === "eliminated",
    playerId: player.id,
    charge: buildPlayerCharge(player, prices, options),
    // `rebuys` counts every re-entry including the doubles, and the two are reported
    // apart so the desk can tell one from the other.
    doubleReentries: doubleRebuys,
    // A pass covers the entry only: re-entries and add-ons are still paid for.
    freePass: player.freePass === "regular" || player.freePass === "vip",
    paid: player.paid === true,
    name: player.name,
    reentries: Math.max(0, rebuys - doubleRebuys),
    registrationNumber: player.registrationNumber ?? null,
    seat: player.seat ?? null,
    table: player.table ?? null,
    ticketType: player.ticketType === "vip" ? "vip" : "regular",
  };
}
