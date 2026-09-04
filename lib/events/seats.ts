import type { EventSignupCount } from "@/lib/events/store";
import type { EventTicketType, TournamentEvent } from "@/lib/events/types";
import { SEATS_PER_TABLE } from "@/lib/tables/seating";

export type FreeSeats = {
  /** Seats left of each kind; null means the poster sets no limit. */
  regular: number | null;
  vip: number | null;
};

const NO_SIGNUPS: EventSignupCount = { regular: 0, total: 0, vip: 0 };

/**
 * What is left of a poster's two allotments.
 *
 * The club opens the regular tables and the VIP table separately, so a full VIP table
 * says nothing about the regular seats — and a poster that names no limit for a kind
 * simply does not run out of it.
 */
export function countFreeSeats(
  event: Pick<TournamentEvent, "maxPlayers" | "maxVipPlayers">,
  taken: EventSignupCount | undefined,
): FreeSeats {
  const counted = taken ?? NO_SIGNUPS;
  // There is one VIP table and it seats ten, so a poster that leaves the field empty
  // still has a number to show — and cannot sell more VIP seats than the room has.
  const vipLimit = event.maxVipPlayers ?? SEATS_PER_TABLE;

  return {
    regular: event.maxPlayers === null ? null : Math.max(0, event.maxPlayers - counted.regular),
    vip: Math.max(0, vipLimit - counted.vip),
  };
}

/** Whether one more player can still ask for this kind of ticket. */
export function hasFreeSeat(seats: FreeSeats, ticket: EventTicketType) {
  const left = ticket === "vip" ? seats.vip : seats.regular;
  return left === null || left > 0;
}

/**
 * Whether the poster offers a VIP ticket at all: the club prices it, or opens seats for
 * it. Without either there is nothing for the player to choose between.
 */
export function offersVipTicket(
  event: Pick<TournamentEvent, "maxVipPlayers" | "vipBuyIn">,
) {
  return event.vipBuyIn !== null || event.maxVipPlayers !== null;
}
