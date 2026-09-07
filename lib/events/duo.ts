import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";

/**
 * The second player on a "1+1".
 *
 * They are either a member of the club, who has an account of their own and confirms
 * the invitation in the app, or a guest from outside it, who is a name on the buyer's
 * sign-up and nothing more until they walk in.
 */
export type DuoPartner = {
  name: string;
  /** How to tell them, when they have a Telegram; a web player is told in the app. */
  telegramId: number | null;
  /** The club account of a member; null for a guest from outside it. */
  userId: string | null;
};

export const MAX_PARTNER_NAME_LENGTH = 40;

/** The guest a "1+1" brings, as the buyer wrote them down. */
export function readPartnerName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_PARTNER_NAME_LENGTH);
}

/**
 * Turns what the player picked into the partner the sign-up records.
 *
 * A member is chosen by nickname and resolved here, so the app never hands the server a
 * Telegram id to act on; a guest is taken at their name. Nobody can bring themselves,
 * and a nickname shared by two accounts is refused rather than guessed — inviting the
 * wrong person is worse than asking the buyer to type the guest in by hand.
 */
/** The one club member a nickname belongs to, or null when it belongs to none or many. */
async function findMemberByName(supabase: SupabaseClient, nicknameKey: string) {
  if (!nicknameKey) return null;

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("id, display_name")
    .eq("nickname_key", nicknameKey)
    .limit(2);

  if (error) throw error;

  const matches = (data ?? []) as Array<{ display_name: string | null; id: string }>;
  // A nickname two accounts share names nobody in particular, so a guest by that name
  // stays a guest rather than being pinned on whichever row came back first.
  return matches.length === 1 ? matches[0] : null;
}

export async function resolveDuoPartner(
  supabase: SupabaseClient,
  {
    partnerKey,
    partnerName,
    selfUserId,
  }: { partnerKey: unknown; partnerName: string; selfUserId: string },
): Promise<{
  error: "ambiguous" | "member_typed" | "not_found" | "self" | null;
  partner: DuoPartner | null;
}> {
  const key = typeof partnerKey === "string" ? buildNicknameKey(partnerKey) : "";

  if (!key) {
    if (!partnerName) return { error: "not_found", partner: null };

    // A member typed in by hand rather than picked from the list would be written down
    // as a guest: no invitation reaches them, nothing appears in their app, and the
    // evening is recorded against a name instead of their account. Refused by name so
    // the buyer picks them properly — which is what they meant in the first place.
    const guest = await findMemberByName(supabase, buildNicknameKey(partnerName));

    if (guest?.id === selfUserId) return { error: "self", partner: null };
    if (guest) return { error: "member_typed", partner: null };

    return { error: null, partner: { name: partnerName, telegramId: null, userId: null } };
  }

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("id, telegram_id, display_name")
    .eq("nickname_key", key)
    .limit(2);

  if (error) throw error;

  const matches = (data ?? []) as Array<{
    display_name: string | null;
    id: string;
    telegram_id: number | null;
  }>;
  if (matches.length === 0) return { error: "not_found", partner: null };
  if (matches.length > 1) return { error: "ambiguous", partner: null };
  if (matches[0].id === selfUserId) return { error: "self", partner: null };

  return {
    error: null,
    partner: {
      name: matches[0].display_name ?? partnerName,
      telegramId: matches[0].telegram_id,
      userId: matches[0].id,
    },
  };
}

export type DuoInvitation = {
  hostName: string;
  /** Null when the buyer signed in on the web: they read the answer in the app. */
  hostTelegramId: number | null;
  hostUserId: string;
  /** Set once this player has already answered by taking their half of the ticket. */
  joined: boolean;
};

/**
 * The pair invitation waiting for this player at one event, if there is one.
 *
 * It lives on the buyer's own sign-up, so a cancelled or withdrawn ticket takes the
 * invitation with it and the app has nothing to show.
 */
export async function findDuoInvitation(
  supabase: SupabaseClient,
  { eventId, userId }: { eventId: string; userId: string },
): Promise<DuoInvitation | null> {
  // One row is expected — the database keeps a player from being asked twice for the
  // same evening — but this reads a list rather than insisting on it: an invitation
  // written before that rule existed must still open the page, not break it.
  // A sign-up points at four accounts — its own, the pair's two halves and the old
  // Telegram key — so the embed has to name the one it means, or PostgREST refuses
  // to guess. `!user_id` is the account the row belongs to.
  const { data, error } = await supabase
    .from("event_signups")
    .select(
      "user_id, telegram_id, duo_confirmed_at, created_at, client_bot_users!user_id(display_name)",
    )
    .eq("event_id", eventId)
    .eq("ticket_type", "duo")
    .eq("duo_partner_user_id", userId)
    .neq("status", "cancelled")
    .order("created_at")
    .limit(1);

  if (error) throw error;

  const [first] = data ?? [];
  if (!first) return null;

  const record = first as {
    client_bot_users?: unknown;
    duo_confirmed_at: string | null;
    telegram_id: number | null;
    user_id: string;
  };
  const embedded = record.client_bot_users;
  const host = (Array.isArray(embedded) ? embedded[0] : embedded) as
    | { display_name?: string | null }
    | undefined;

  return {
    hostName: host?.display_name ?? "Игрок клуба",
    hostTelegramId: record.telegram_id,
    hostUserId: record.user_id,
    joined: Boolean(record.duo_confirmed_at),
  };
}

/**
 * Whether somebody else is already bringing this player to the evening.
 *
 * A member can be the +1 of one ticket only: two buyers naming the same person leaves
 * one of them with a partner who cannot come. Asked before the sign-up is written so
 * the buyer is told to pick somebody else, rather than meeting the database's refusal.
 */
export async function isPartnerTaken(
  supabase: SupabaseClient,
  {
    eventId,
    hostUserId,
    partnerUserId,
  }: { eventId: string; hostUserId: string; partnerUserId: string },
) {
  const { data, error } = await supabase
    .from("event_signups")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("duo_partner_user_id", partnerUserId)
    .neq("user_id", hostUserId)
    .neq("status", "cancelled")
    .limit(1);

  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Withdraws the +1 half of a pair — the buyer cancelled, or the partner said no. */
export async function cancelDuoPlusOne(
  supabase: SupabaseClient,
  { eventId, hostUserId }: { eventId: string; hostUserId: string },
) {
  const { error } = await supabase
    .from("event_signups")
    .update({ status: "cancelled" })
    .eq("event_id", eventId)
    .eq("duo_host_user_id", hostUserId)
    .neq("status", "cancelled");

  if (error) throw error;
}

export function duoInviteMessage(hostName: string, eventTitle: string) {
  return (
    `${hostName} зовёт вас на «${eventTitle}» вторым игроком по билету 1+1.\n\n` +
    "Откройте приложение и подтвердите, что придёте — место закреплено за вами."
  );
}

export function duoAnswerMessage(partnerName: string, eventTitle: string, accepted: boolean) {
  return accepted
    ? `${partnerName} придёт с вами на «${eventTitle}» по билету 1+1.`
    : `${partnerName} не сможет прийти на «${eventTitle}». Билет 1+1 остался за вами — ` +
        "выберите другого напарника в приложении.";
}

export function duoCancelledMessage(hostName: string, eventTitle: string) {
  return `${hostName} отменил запись на «${eventTitle}», и билет 1+1 больше не действует.`;
}

/**
 * The pass a buyer sends to somebody the club has never met.
 *
 * Short enough to sit in a link and be sent in a message, random enough that nobody
 * arrives at somebody else's invitation by guessing.
 */
export function createDuoInviteToken() {
  return randomBytes(12).toString("base64url");
}

export type DuoInviteClaim =
  | { error: "gone" | "taken" | "self"; eventId: null }
  | { error: null; eventId: string };

/**
 * Hands the second half of a pair to whoever opened the link.
 *
 * Spent on use: the token is cleared as the partner is written in, so the same link
 * cannot seat two people, and somebody who opens it later is told it is gone rather
 * than quietly taking a place that is filled.
 */
export async function claimDuoInvite(
  supabase: SupabaseClient,
  { token, userId }: { token: string; userId: string },
): Promise<DuoInviteClaim> {
  const clean = token.trim();
  if (!clean) return { error: "gone", eventId: null };

  const { data, error } = await supabase
    .from("event_signups")
    .select("event_id, user_id, duo_partner_user_id")
    .eq("duo_invite_token", clean)
    .neq("status", "cancelled")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { error: "gone", eventId: null };

  const invite = data as {
    duo_partner_user_id: string | null;
    event_id: string;
    user_id: string;
  };

  // The buyer cannot be their own plus one.
  if (invite.user_id === userId) return { error: "self", eventId: null };
  if (invite.duo_partner_user_id) return { error: "gone", eventId: null };

  // Somebody is already bringing this player to the same evening — one member is the
  // +1 of one ticket, and the database says so too.
  if (await isPartnerTaken(supabase, {
    eventId: invite.event_id,
    hostUserId: invite.user_id,
    partnerUserId: userId,
  })) {
    return { error: "taken", eventId: null };
  }

  const { error: writeError } = await supabase
    .from("event_signups")
    .update({ duo_confirmed_at: null, duo_invite_token: null, duo_partner_user_id: userId })
    .eq("duo_invite_token", clean);

  if (writeError) throw writeError;

  return { error: null, eventId: invite.event_id };
}

/**
 * The evenings where somebody is waiting on this player to say they are coming as their
 * +1, asked for a whole list at once.
 *
 * The tournament's own screen reads one invitation at a time; the home screen has to
 * mark every card, and one query does for all of them.
 */
export async function findDuoInvitationEventIds(
  supabase: SupabaseClient,
  { eventIds, userId }: { eventIds: string[]; userId: string },
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("event_signups")
    .select("event_id")
    .in("event_id", eventIds)
    .eq("ticket_type", "duo")
    .eq("duo_partner_user_id", userId)
    .is("duo_confirmed_at", null)
    .neq("status", "cancelled");

  if (error) throw error;

  return new Set((data ?? []).map((row) => String((row as { event_id: unknown }).event_id)));
}
