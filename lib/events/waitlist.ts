import type { EventSignup, EventTicketType, TournamentEvent } from "@/lib/events/types";
import type { FreeSeats } from "@/lib/events/seats";
import { formatEventTimeLabel, waitlistOfferIsLive } from "@/lib/events/types";

/**
 * How long the club holds a freed place for the player it was offered to.
 *
 * Long enough to answer a message and open the app, short enough that the queue behind
 * them still gets the evening. The window lives here alone: what is written down is the
 * deadline it produces, so the database never repeats the number.
 */
export const WAITLIST_OFFER_MINUTES = 30;

/**
 * Until when a place freed now can be held — null when there is nothing left to hold.
 *
 * Sign-ups close at some point, and a seat held past that hour is a seat nobody can
 * take: the offer is cut short at the deadline the poster itself sets.
 */
export function waitlistOfferDeadline(
  event: Pick<TournamentEvent, "lateEntryUntil" | "startsAt">,
  now: Date,
): Date | null {
  const closes = new Date(event.lateEntryUntil ?? event.startsAt).getTime();
  if (!Number.isFinite(closes) || closes <= now.getTime()) return null;

  return new Date(Math.min(now.getTime() + WAITLIST_OFFER_MINUTES * 60_000, closes));
}

/** Which allotment a ticket is counted against; both halves of a pair share one. */
function seatKind(ticket: EventTicketType): keyof FreeSeats {
  if (ticket === "vip") return "vip";
  if (ticket === "duo" || ticket === "duo_plus_one") return "duo";

  return "regular";
}

/** Whoever joined first goes first — the whole promise of a waiting list. */
function orderInQueue(waitlist: EventSignup[]) {
  return [...waitlist].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/**
 * Who the freed places go to.
 *
 * One place, one player: the seat is held for the head of the queue and for nobody
 * else, so the evening is not won by whoever happens to be looking at their phone. Two
 * places freed at once reach the two first in line, three reach three — the offers go
 * out as far as the seats do and stop there.
 *
 * A player already holding an offer is skipped: their place is counted as taken, and
 * telling them twice about the same seat says nothing new. So is one whose turn came
 * and passed in silence — the seat moves down the line and is open to everybody once
 * the line runs out, rather than coming back to them every half hour for the rest of
 * the week. The three allotments run out separately, so somebody waiting for a VIP seat
 * hears nothing when a regular one opens.
 */
export function pickWaitlistOffers(
  waitlist: EventSignup[],
  seats: FreeSeats,
  now: Date,
): EventSignup[] {
  const left: Record<keyof FreeSeats, number | null> = {
    duo: seats.duo,
    regular: seats.regular,
    vip: seats.vip,
  };
  const offered: EventSignup[] = [];

  for (const entry of orderInQueue(waitlist)) {
    if (waitlistOfferIsLive(entry.waitlistOfferExpiresAt, now)) continue;
    // Their turn has already been: one offer each is what keeps the queue moving
    // forwards instead of circling back to whoever never answers.
    if (entry.waitlistOfferedAt) continue;

    const kind = seatKind(entry.ticketType);
    const free = left[kind];
    // A poster that names no limit for a kind never runs out of it.
    if (free !== null && free <= 0) continue;

    offered.push(entry);
    if (free !== null) left[kind] = free - 1;
  }

  return offered;
}

const TICKET_WORDS: Record<EventTicketType, string> = {
  duo: "билет 1+1",
  duo_plus_one: "место",
  regular: "место",
  vip: "VIP-место",
};

export function waitlistOfferMessage(
  eventTitle: string,
  ticket: EventTicketType,
  expiresAt: Date,
) {
  return (
    `На «${eventTitle}» освободилось ${TICKET_WORDS[ticket]}, и очередь дошла до вас. ` +
    `Держим его за вами до ${formatEventTimeLabel(expiresAt.toISOString())} — ` +
    "откройте приложение и запишитесь. Потом место уйдёт следующему в очереди."
  );
}

/** Their half hour passed in silence, and the seat went on down the line. */
export function waitlistOfferMissedMessage(eventTitle: string) {
  return (
    `Полчаса прошло — место на «${eventTitle}» больше не держим за вами: ` +
    "очередь пошла дальше. Если оно ещё свободно, записаться можно в приложении."
  );
}
