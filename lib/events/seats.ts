import type { EventSignupCount } from "@/lib/events/store";
import type { EventTicketType, TournamentEvent } from "@/lib/events/types";

/** The two allotments of a poster, and how many players they let in together. */
export type AnnouncedSeats = {
  /** Tickets, not seats: each one brings a pair. */
  duoTickets: number;
  regular: number;
  total: number;
};

export type FreeSeats = {
  /** "1+1" tickets left; zero when the poster sells none tonight. */
  duo: number;
  /** Regular seats left; null means the poster sets no limit. */
  regular: number | null;
};

const NO_SIGNUPS: EventSignupCount = { duo: 0, regular: 0, total: 0 };

/**
 * What is left of a poster's two allotments.
 *
 * The club opens the regular seats and the "1+1" tickets separately, and a poster that
 * names no regular limit simply does not run out of it. The pair's second seat is inside
 * the duo ticket itself and is never counted against the regular allotment.
 */
export function countFreeSeats(
  event: Pick<TournamentEvent, "maxDuoTickets" | "maxPlayers">,
  taken: EventSignupCount | undefined,
): FreeSeats {
  const counted = taken ?? NO_SIGNUPS;

  return {
    duo: Math.max(0, (event.maxDuoTickets ?? 0) - counted.duo),
    regular: event.maxPlayers === null ? null : Math.max(0, event.maxPlayers - counted.regular),
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

  return seats.regular === null || seats.regular > 0;
}

/**
 * How many players the poster lets in altogether, spelled out by kind — a "1+1" ticket
 * brings two of them.
 *
 * The two allotments are sold apart and nothing here limits anything: the line is for
 * the admin filling the poster in, because only they know how many chairs the room has.
 */
export function describeAnnouncedSeats({
  duoTickets,
  regular,
}: {
  duoTickets: number;
  regular: number;
}) {
  const duoSeats = duoTickets * 2;
  const parts = [`${regular} обычных`];
  if (duoSeats) parts.push(`${duoSeats} по билетам 1+1`);

  return `Всего мест: ${regular + duoSeats} (${parts.join(" · ")})`;
}

/**
 * What the poster announces, by kind and altogether: the regular seats and both halves
 * of every "1+1" ticket. Null when the club named no regular limit — without it there is
 * no total to show.
 */
export function countAnnouncedSeats(
  event: Pick<TournamentEvent, "duoBuyIn" | "maxDuoTickets" | "maxPlayers">,
): AnnouncedSeats | null {
  if (event.maxPlayers === null) return null;

  // A "1+1" the poster does not sell adds nothing, whatever number is left in its field.
  const duoTickets = offersDuoTicket(event) ? event.maxDuoTickets ?? 0 : 0;

  return {
    duoTickets,
    regular: event.maxPlayers,
    total: event.maxPlayers + duoTickets * 2,
  };
}

/**
 * "20/27 забронировано" — how much of the poster is already spoken for.
 *
 * The card shows what is left of the evening rather than the size of the room: a player
 * scrolling the afisha decides by how full it is. The taken half never runs past the
 * announced one — the desk can seat a walk-in the poster never counted, and a chip
 * reading "30/27" looks like a broken number rather than a busy night.
 */
export function formatSeatsTaken(taken: number, total: number) {
  return `${Math.min(taken, total)} из ${total}`;
}

/** "27 мест" — the count a poster or a chip shows on its own. */
export function formatSeatsCount(seats: number) {
  const lastTwo = seats % 100;
  const last = seats % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${seats} мест`;
  if (last === 1) return `${seats} место`;
  if (last >= 2 && last <= 4) return `${seats} места`;

  return `${seats} мест`;
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
