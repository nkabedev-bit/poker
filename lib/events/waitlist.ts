import type { EventSignup, EventTicketType } from "@/lib/events/types";
import type { FreeSeats } from "@/lib/events/seats";
import { hasFreeSeat } from "@/lib/events/seats";

/**
 * Who to tell that a place came free.
 *
 * Everybody waiting for the kind of ticket that opened, in the order they joined the
 * queue — the club owner's choice: whoever answers first takes it. Holding the seat for
 * the head of the line would need a timer and a rule for the silence that follows.
 *
 * A player waiting for a VIP seat hears nothing when a regular one opens; the two run
 * out separately and so does the news.
 */
export function pickWaitlistToNotify(
  waitlist: EventSignup[],
  seats: FreeSeats,
): EventSignup[] {
  return waitlist.filter((entry) => hasFreeSeat(seats, entry.ticketType));
}

const TICKET_WORDS: Record<EventTicketType, string> = {
  duo: "билет 1+1",
  duo_plus_one: "место",
  regular: "место",
  vip: "VIP-место",
};

export function waitlistFreedMessage(eventTitle: string, ticket: EventTicketType) {
  return (
    `На «${eventTitle}» освободилось ${TICKET_WORDS[ticket]}. ` +
    "Откройте приложение и запишитесь — место достанется тому, кто успеет первым."
  );
}
