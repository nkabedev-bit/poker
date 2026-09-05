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
export async function resolveDuoPartner(
  supabase: SupabaseClient,
  {
    partnerKey,
    partnerName,
    selfUserId,
  }: { partnerKey: unknown; partnerName: string; selfUserId: string },
): Promise<{ error: "ambiguous" | "not_found" | "self" | null; partner: DuoPartner | null }> {
  const key = typeof partnerKey === "string" ? buildNicknameKey(partnerKey) : "";

  if (!key) {
    return partnerName
      ? { error: null, partner: { name: partnerName, telegramId: null, userId: null } }
      : { error: "not_found", partner: null };
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
  const { data, error } = await supabase
    .from("event_signups")
    .select("user_id, telegram_id, duo_confirmed_at, created_at, client_bot_users(display_name)")
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
