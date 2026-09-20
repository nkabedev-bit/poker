import type { EventTicketType } from "@/lib/events/types";
import type { EventSignupWithPlayer } from "@/lib/events/store";

/** One name on the list of who is coming, as the club's players see each other. */
export type SignupListEntry = {
  avatarUrl: string | null;
  /** Somebody brought on a "1+1" who has no account here — a name and nothing else. */
  isGuest: boolean;
  isMe: boolean;
  key: string;
  name: string;
  ticketType: EventTicketType;
};

/**
 * Sign-ups as a list of names and faces, in the order they were made.
 *
 * Which sign-ups belong on the list is the caller's to decide — those holding a ticket
 * and those standing in the queue are shown apart, and mixing them would promise seats
 * the room does not have. The nickname from the questionnaire is the name the club
 * calls people by, so it is the one shown — never the Telegram handle.
 *
 * A "1+1" guest with no account of their own is carried on the buyer's row, and is
 * listed under the name the buyer wrote down: they take a chair like everybody else,
 * and a list that left them out would not match the room.
 */
export function buildSignupList(
  signups: EventSignupWithPlayer[],
  {
    findAvatar,
    myUserId,
  }: {
    findAvatar?: (signup: { name: string; telegramId: number | null }) => string | null;
    myUserId?: string | null;
  } = {},
): SignupListEntry[] {
  return signups.flatMap((signup) => {
    const name = signup.displayName?.trim() || "Игрок клуба";
    const entries: SignupListEntry[] = [
      {
        avatarUrl: findAvatar?.({ name, telegramId: signup.telegramId }) ?? null,
        isGuest: false,
        isMe: Boolean(myUserId) && signup.userId === myUserId,
        key: signup.id,
        name,
        ticketType: signup.ticketType,
      },
    ];

    // The invited half of a pair who plays at the club has a sign-up of their own, and
    // would otherwise be listed twice.
    const guestName = signup.duoPartnerName?.trim();
    if (signup.ticketType === "duo" && guestName && !signup.duoPartnerUserId) {
      entries.push({
        avatarUrl: null,
        isGuest: true,
        isMe: false,
        key: `${signup.id}:guest`,
        name: guestName,
        ticketType: "duo_plus_one",
      });
    }

    return entries;
  });
}
