import type { EventSignupCount } from "@/lib/events/store";
import type { EventTicketType, TournamentEvent } from "@/lib/events/types";
import { SEATS_PER_TABLE } from "@/lib/tables/seating";

export type FreeSeats = {
  /** "1+1" tickets left; zero when the poster sells none tonight. */
  duo: number;
  /** Seats left of each kind; null means the poster sets no limit. */
  regular: number | null;
  vip: number | null;
};

const NO_SIGNUPS: EventSignupCount = { duo: 0, regular: 0, total: 0, vip: 0 };

/**
 * What is left of a poster's three allotments.
 *
 * The club opens the regular tables, the VIP table and the "1+1" tickets separately, so
 * a full VIP table says nothing about the regular seats — and a poster that names no
 * limit for a kind simply does not run out of it. The pair's second seat is inside the
 * duo ticket itself and is never counted against the regular allotment.
 */
export function countFreeSeats(
  event: Pick<TournamentEvent, "maxDuoTickets" | "maxPlayers" | "maxVipPlayers">,
  taken: EventSignupCount | undefined,
): FreeSeats {
  const counted = taken ?? NO_SIGNUPS;
  // There is one VIP table and it seats ten, so a poster that leaves the field empty
  // still has a number to show — and cannot sell more VIP seats than the room has.
  const vipLimit = event.maxVipPlayers ?? SEATS_PER_TABLE;

  return {
    duo: Math.max(0, (event.maxDuoTickets ?? 0) - counted.duo),
    regular: event.maxPlayers === null ? null : Math.max(0, event.maxPlayers - counted.regular),
    vip: Math.max(0, vipLimit - counted.vip),
  };
}

/**
 * Whether one more player can still ask for this kind of ticket.
 *
 * The +1 of a pair asks for nothing of their own: their seat came with the ticket the
 * host already holds, so an event sold out of everything still lets them in.
 */
export function hasFreeSeat(seats: FreeSeats, ticket: EventTicketType) {
  if (ticket === "duo_plus_one") return true;
  if (ticket === "duo") return seats.duo > 0;

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
  // Zero VIP seats means there is no VIP table tonight, whatever the price says.
  if (event.maxVipPlayers === 0) return false;

  return event.vipBuyIn !== null || event.maxVipPlayers !== null;
}

/**
 * How many players the poster lets in altogether, spelled out by kind — a "1+1" ticket
 * brings two of them.
 *
 * The three allotments are sold apart and nothing here limits anything: the line is for
 * the admin filling the poster in, because only they know how many chairs the room has.
 */
export function describeAnnouncedSeats({
  duoTickets,
  regular,
  vip,
}: {
  duoTickets: number;
  regular: number;
  vip: number;
}) {
  const duoSeats = duoTickets * 2;
  const parts = [`${regular} обычных`];
  if (duoSeats) parts.push(`${duoSeats} по билетам 1+1`);
  if (vip) parts.push(`${vip} VIP`);

  return `Всего мест: ${regular + duoSeats + vip} (${parts.join(" · ")})`;
}

/**
 * Whether the poster sells the "1+1" at all. Both halves have to be there: a price
 * without tickets is nothing to buy, and a ticket without a price has nothing to charge.
 */
export function offersDuoTicket(
  event: Pick<TournamentEvent, "duoBuyIn" | "maxDuoTickets">,
) {
  return (event.maxDuoTickets ?? 0) > 0 && event.duoBuyIn !== null;
}
