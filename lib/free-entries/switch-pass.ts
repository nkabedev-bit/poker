import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { claimEventSignup, SIGNUP_FULL, SIGNUP_PASS_HELD } from "@/lib/events/claim-signup";
import { getEvent, getUserSignups } from "@/lib/events/store";
import {
  formatEventDayLabel,
  isEventOpenForSeating,
  type FreePassChoice,
  type TournamentEvent,
} from "@/lib/events/types";
import { countFreePasses, loadPassHolds } from "@/lib/free-entries/holds";

export type PassSwitchAccount = { free_entries?: number | null; id: string };

export type PassSwitchError =
  | "closed"
  | "full"
  | "no_pass"
  | "not_found"
  | "not_regular"
  | "not_signed_up"
  | "pass_held";

export type PassSwitchOutcome =
  | { event: TournamentEvent; ok: true; usePass: FreePassChoice }
  | { error: PassSwitchError; message: string; ok: false };

function refuse(error: PassSwitchError, message: string): PassSwitchOutcome {
  return { error, message, ok: false };
}

/**
 * Turns a regular ticket the player already holds into one paid with a pass, or back.
 *
 * Sign-ups open on Monday and the room is full minutes later, so a pass won on Tuesday
 * could not reach Thursday's game: cancelling to sign up again with it handed the seat to
 * the queue. Only what the ticket is paid with changes here — the seat stays the player's.
 *
 * A pass is still only spent at the door, so the ticket merely writes down which pass it
 * will be paid with, and the same pass cannot be written down for two games at once.
 */
export async function switchSignupPass(
  supabase: SupabaseClient,
  {
    account,
    eventId,
    now = new Date(),
    usePass,
  }: { account: PassSwitchAccount; eventId: string; now?: Date; usePass: FreePassChoice },
): Promise<PassSwitchOutcome> {
  const event = await getEvent(supabase, eventId);
  if (!event || !event.isPublished) return refuse("not_found", "Турнир не найден.");

  const mine = (await getUserSignups(supabase, account.id)).find(
    (signup) => signup.eventId === eventId,
  );

  // A seated player has paid at the door already; a reserved ticket or a place in line is
  // not a ticket yet. Either way there is nothing to switch.
  if (mine?.status !== "signed_up") {
    return refuse("not_signed_up", `Вы не записаны на «${event.title}».`);
  }

  // A pass buys a single seat; the "1+1" has its own price.
  if (mine.ticketType !== "regular") {
    return refuse("not_regular", "Проходка закрывает только обычный билет.");
  }

  if (!isEventOpenForSeating(event, now)) {
    return refuse("closed", `«${event.title}» уже прошёл.`);
  }

  if (mine.usePass === usePass) return { event, ok: true, usePass };

  // Letting a pass go needs no counting: it simply goes back to the account.
  if (usePass === "none") {
    const { error } = await supabase
      .from("event_signups")
      .update({ use_pass: "none" })
      .eq("event_id", eventId)
      .eq("user_id", account.id)
      .eq("status", "signed_up");

    if (error) throw error;

    return { event, ok: true, usePass };
  }

  const passes = countFreePasses(account, await loadPassHolds(supabase, account.id, now), eventId);

  if (passes.regular <= 0) {
    const promised = passes.heldFor[0];

    return promised
      ? refuse(
          "pass_held",
          `Проходка уже закреплена за записью на «${promised.title}» (${formatEventDayLabel(promised.startsAt)}). Переключите ту запись на обычный билет.`,
        )
      : refuse("no_pass", "Свободных проходок не осталось.");
  }

  // Written through the same counting as a new sign-up, under the player's row lock: two
  // switches sent together with a single pass must not both take it. The player's own
  // row is left out of the room count, so their seat is never asked for twice.
  const claim = await claimEventSignup(supabase, {
    duoConfirmedAt: null,
    duoInviteToken: null,
    duoPartnerName: null,
    duoPartnerUserId: null,
    eventId,
    status: "signed_up",
    telegramId: mine.telegramId,
    ticketType: "regular",
    usePass: "regular",
    userId: account.id,
  });

  if (claim === SIGNUP_PASS_HELD) {
    return refuse("pass_held", "Проходка уже закреплена за другой вашей записью.");
  }

  // Only when the club cut the room below the tickets already sold.
  if (claim === SIGNUP_FULL) {
    return refuse("full", "Не получилось сменить билет — напишите в поддержку.");
  }

  return { event, ok: true, usePass };
}
