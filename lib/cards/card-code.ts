import { buildPlayerCharge, type FinancePrices, type PlayerCharge } from "@/lib/finance/player-charge";
import type { TournamentPlayer } from "@/lib/timer/types";

export type TicketType = "regular" | "vip";

/**
 * What the admin sees after scanning a card. No prices: the club reads the composition
 * off the screen and takes payment at the desk.
 */
export type CardSession = {
  addons: number;
  cardCode: string;
  /** What the player owes for the evening, line by line. */
  charge: PlayerCharge;
  doubleReentries: number;
  /** The entry was covered by a free pass — nothing to take for the ticket. */
  freePass: boolean;
  name: string;
  registrationNumber: number | null;
  reentries: number;
  /** The chair the player was given, so the desk can point at it. */
  seat: number | null;
  table: number | null;
  ticketType: TicketType;
};

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
    charge: buildPlayerCharge(player, prices, options),
    // `rebuys` counts every re-entry including the doubles, and the two are reported
    // apart so the desk can tell one from the other.
    doubleReentries: doubleRebuys,
    // A pass covers the entry only: re-entries and add-ons are still paid for.
    freePass: player.freePass === "regular" || player.freePass === "vip",
    name: player.name,
    reentries: Math.max(0, rebuys - doubleRebuys),
    registrationNumber: player.registrationNumber ?? null,
    seat: player.seat ?? null,
    table: player.table ?? null,
    ticketType: player.ticketType === "vip" ? "vip" : "regular",
  };
}
