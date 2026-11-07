import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientBot, sendToChats } from "@/lib/client-bot/broadcast";
import { notifyClientUser } from "@/lib/client-bot/notify";
import {
  buildSignupBanMessage,
  isSignupBanned,
  readSignupBan,
} from "@/lib/client-bot/signup-ban";
import { readSignupDebt } from "@/lib/debts/store";
import { claimEventSignup, SIGNUP_FULL } from "@/lib/events/claim-signup";
import { cancelDuoPlusOne, duoAnswerMessage, duoCancelledMessage } from "@/lib/events/duo";
import {
  buildRescheduleKeyboard,
  findRescheduleNotice,
  pairHandedOverMessage,
  type RescheduleAnswer,
  type RescheduleOutcome,
} from "@/lib/events/reschedule-notice";
import { getEvent, getUserSignups } from "@/lib/events/store";
import { isUpcomingEvent, type EventSignup, type TournamentEvent } from "@/lib/events/types";
import { announceWaitlistOffer, offerFreedSeats } from "@/lib/events/waitlist-offers";

/** The tickets a moved game asks about: everyone holding a seat who is not yet sat down. */
const ASKED_STATUSES = ["signed_up", "reserved"] as const;

function isAsked(status: EventSignup["status"]) {
  return ASKED_STATUSES.some((asked) => asked === status);
}

type Recipient = { chatId: number | null; name: string; userId: string };

async function listRecipients(supabase: SupabaseClient, eventId: string): Promise<Recipient[]> {
  // `!user_id` is the account the sign-up belongs to, not either half of a pair.
  const { data, error } = await supabase
    .from("event_signups")
    .select("user_id, client_bot_users!user_id(chat_id, display_name)")
    .eq("event_id", eventId)
    .in("status", [...ASKED_STATUSES]);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const record = row as { client_bot_users?: unknown; user_id: string };
    const embedded = record.client_bot_users;
    const account = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | { chat_id?: unknown; display_name?: string | null }
      | undefined;
    const chatId = Number(account?.chat_id);

    return {
      chatId: Number.isFinite(chatId) && chatId !== 0 ? chatId : null,
      name: account?.display_name ?? record.user_id,
      userId: record.user_id,
    };
  });
}

export type RescheduleSendReport = {
  failed: number;
  noChat: string[];
  recipients: string[];
  sent: number;
};

/**
 * Asks everybody holding a seat whether they can come at the new hour.
 *
 * A dry run only reads who would be asked, so the list can be checked before anything
 * goes out. Players who refused the club's broadcasts are asked too: this is about a
 * seat they hold, not news.
 */
export async function sendRescheduleNotice(
  supabase: SupabaseClient,
  eventId: string,
  { dryRun }: { dryRun: boolean },
): Promise<RescheduleSendReport> {
  const notice = findRescheduleNotice(eventId);
  if (!notice) throw new Error(`No reschedule notice is set for event ${eventId}`);

  const recipients = await listRecipients(supabase, eventId);
  const reachable = recipients.filter((recipient) => recipient.chatId !== null);
  const report = {
    failed: 0,
    noChat: recipients.filter((recipient) => recipient.chatId === null).map((r) => r.name),
    recipients: reachable.map((recipient) => recipient.name),
    sent: 0,
  };
  if (dryRun) return report;

  const bot = getClientBot();
  if (!bot) throw new Error("CLIENT_TELEGRAM_BOT_TOKEN is not configured");

  const keyboard = buildRescheduleKeyboard(eventId);
  const { failed, sent } = await sendToChats(
    reachable.map((recipient) => recipient.chatId as number),
    (chatId) => bot.api.sendMessage(chatId, notice.text, { reply_markup: keyboard }),
  );

  return { ...report, failed, sent };
}

/**
 * Hands any seat that just came free to the head of the queue, with the same question.
 *
 * Never throws: the answer that freed the seat already stands, and a queue that failed
 * to move is moved on by the next cancellation or the cron.
 */
async function passSeatsDownTheQueue(supabase: SupabaseClient, event: TournamentEvent) {
  try {
    const offers = await offerFreedSeats(supabase, event);
    for (const offer of offers) {
      await announceWaitlistOffer(supabase, event, offer);
    }
  } catch (error) {
    console.error("Could not pass the freed seat down the queue", { eventId: event.id, error });
  }
}

async function cancelSignup(supabase: SupabaseClient, eventId: string, userId: string) {
  const { error } = await supabase
    .from("event_signups")
    .update({ status: "cancelled" })
    .eq("event_id", eventId)
    .eq("user_id", userId);

  if (error) throw error;
}

/**
 * The buyer of a "1+1" cannot come, so the +1 who joined them takes the ticket over.
 *
 * Only a member already on the ticket can: somebody merely invited, or a guest written
 * down by name, has no seat of their own to keep. Returns the +1's account, or null
 * when there was nobody to hand it to. The +1's row is turned into the ticket before the
 * buyer's is let go, so the pair's allotment is never counted as free in between.
 */
async function handPairToPartner(
  supabase: SupabaseClient,
  eventId: string,
  hostUserId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("event_signups")
    .update({ duo_host_user_id: null, ticket_type: "duo" })
    .eq("event_id", eventId)
    .eq("duo_host_user_id", hostUserId)
    .eq("ticket_type", "duo_plus_one")
    .eq("status", "signed_up")
    .select("user_id");

  if (error) throw error;

  const [partner] = (data ?? []) as Array<{ user_id: string }>;
  return partner?.user_id ?? null;
}

async function answerAsHolder(
  supabase: SupabaseClient,
  event: TournamentEvent,
  signup: EventSignup,
  player: { id: string; name: string },
  accept: boolean,
): Promise<RescheduleOutcome> {
  if (accept) return { kind: "confirmed" };

  if (signup.ticketType === "duo") {
    const heir = await handPairToPartner(supabase, event.id, player.id);
    await cancelSignup(supabase, event.id, player.id);

    if (heir) {
      await notifyClientUser(supabase, heir, pairHandedOverMessage(event.title));
      return { kind: "pair_handed_over" };
    }

    // Invited but never joined: the invitation goes with the ticket, and they hear so.
    await cancelDuoPlusOne(supabase, { eventId: event.id, hostUserId: player.id });
    if (signup.duoPartnerUserId) {
      await notifyClientUser(
        supabase,
        signup.duoPartnerUserId,
        duoCancelledMessage(player.name, event.title),
      );
    }
  } else if (signup.ticketType === "duo_plus_one") {
    await cancelSignup(supabase, event.id, player.id);

    // The buyer keeps the ticket and may bring somebody else, as when a +1 cancels in the app.
    if (signup.duoHostUserId) {
      const { error } = await supabase
        .from("event_signups")
        .update({ duo_confirmed_at: null, duo_partner_name: null, duo_partner_user_id: null })
        .eq("event_id", event.id)
        .eq("user_id", signup.duoHostUserId);

      if (error) throw error;

      await notifyClientUser(
        supabase,
        signup.duoHostUserId,
        duoAnswerMessage(player.name, event.title, false),
      );
    }
  } else {
    await cancelSignup(supabase, event.id, player.id);
  }

  // Not written down as a late cancellation: the club moved the game, not the player.
  await passSeatsDownTheQueue(supabase, event);

  return { kind: "released" };
}

async function answerFromQueue(
  supabase: SupabaseClient,
  event: TournamentEvent,
  signup: EventSignup,
  player: { id: string },
  accept: boolean,
): Promise<RescheduleOutcome> {
  if (!accept) {
    const { error } = await supabase
      .from("event_signups")
      .update({ status: "cancelled", waitlist_offer_expires_at: null })
      .eq("event_id", event.id)
      .eq("user_id", player.id)
      .eq("status", "waitlist");

    if (error) throw error;

    // The seat held for them is free again and goes on to the next in line.
    await passSeatsDownTheQueue(supabase, event);
    return { kind: "left_queue" };
  }

  // The same doors the app keeps shut on a sign-up: a ban for late cancellations, a debt.
  const bannedUntil = await readSignupBan(supabase, player.id);
  if (isSignupBanned(bannedUntil)) {
    return { kind: "blocked", message: buildSignupBanMessage(bannedUntil as string) };
  }
  const debtMessage = await readSignupDebt(supabase, player.id);
  if (debtMessage) return { kind: "blocked", message: debtMessage };

  // The database counts the room under the poster's lock; a seat still held for this
  // player is theirs, one that has gone on to the next in line is not.
  const refused = await claimEventSignup(supabase, {
    duoConfirmedAt: null,
    duoInviteToken: null,
    duoPartnerName: null,
    duoPartnerUserId: null,
    eventId: event.id,
    status: "signed_up",
    telegramId: signup.telegramId,
    ticketType: signup.ticketType,
    usePass: "none",
    userId: player.id,
  });

  if (refused === SIGNUP_FULL) return { kind: "seat_gone" };
  if (refused) return { kind: "blocked", message: "Не получилось записать вас. Попробуйте в приложении." };

  return { kind: "seated_from_queue" };
}

/**
 * What a tap on "yes" or "no" under the notice does.
 *
 * Read against the player's sign-up as it stands at the tap, not as it was when the
 * question went out: a +1 handed the ticket answers as its holder, a player whose turn
 * in the queue passed is told the seat went on. Null when the game has no notice at all.
 */
export async function answerRescheduleNotice(
  supabase: SupabaseClient,
  { answer, telegramId }: { answer: RescheduleAnswer; telegramId: number },
  now: Date = new Date(),
): Promise<RescheduleOutcome | null> {
  if (!findRescheduleNotice(answer.eventId)) return null;

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("id, display_name")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error) throw error;

  const account = data as { display_name: string | null; id: string } | null;
  if (!account) return { kind: "no_signup" };

  const [event, signups] = await Promise.all([
    getEvent(supabase, answer.eventId),
    getUserSignups(supabase, account.id),
  ]);
  const signup = signups.find((row) => row.eventId === answer.eventId);

  if (!event || !signup) return { kind: "no_signup" };
  if (!isUpcomingEvent(event, now)) return { kind: "closed" };

  const player = { id: account.id, name: account.display_name ?? "Игрок клуба" };

  if (signup.status === "waitlist") {
    return answerFromQueue(supabase, event, signup, player, answer.accept);
  }
  if (isAsked(signup.status)) {
    return answerAsHolder(supabase, event, signup, player, answer.accept);
  }

  return { kind: "no_signup" };
}
