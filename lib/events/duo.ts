import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";

/**
 * The second player on a "1+1".
 *
 * They are either a member of the club, who has an account of their own and confirms
 * the invitation in the app, or a guest from outside it, who is a name on the buyer's
 * sign-up and nothing more until they walk in.
 */
export type DuoPartner = { name: string; telegramId: number | null };

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
    selfTelegramId,
  }: { partnerKey: unknown; partnerName: string; selfTelegramId: number },
): Promise<{ error: "ambiguous" | "not_found" | "self" | null; partner: DuoPartner | null }> {
  const key = typeof partnerKey === "string" ? buildNicknameKey(partnerKey) : "";

  if (!key) {
    return partnerName
      ? { error: null, partner: { name: partnerName, telegramId: null } }
      : { error: "not_found", partner: null };
  }

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("telegram_id, display_name")
    .eq("nickname_key", key)
    .limit(2);

  if (error) throw error;

  const matches = (data ?? []) as Array<{ display_name: string | null; telegram_id: number }>;
  if (matches.length === 0) return { error: "not_found", partner: null };
  if (matches.length > 1) return { error: "ambiguous", partner: null };
  if (matches[0].telegram_id === selfTelegramId) return { error: "self", partner: null };

  return {
    error: null,
    partner: {
      name: matches[0].display_name ?? partnerName,
      telegramId: matches[0].telegram_id,
    },
  };
}

export type DuoInvitation = {
  hostName: string;
  hostTelegramId: number;
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
  { eventId, telegramId }: { eventId: string; telegramId: number },
): Promise<DuoInvitation | null> {
  const { data, error } = await supabase
    .from("event_signups")
    .select("telegram_id, duo_confirmed_at, client_bot_users(display_name)")
    .eq("event_id", eventId)
    .eq("ticket_type", "duo")
    .eq("duo_partner_telegram_id", telegramId)
    .neq("status", "cancelled")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const record = data as {
    client_bot_users?: unknown;
    duo_confirmed_at: string | null;
    telegram_id: number;
  };
  const embedded = record.client_bot_users;
  const host = (Array.isArray(embedded) ? embedded[0] : embedded) as
    | { display_name?: string | null }
    | undefined;

  return {
    hostName: host?.display_name ?? "Игрок клуба",
    hostTelegramId: record.telegram_id,
    joined: Boolean(record.duo_confirmed_at),
  };
}

/** Withdraws the +1 half of a pair — the buyer cancelled, or the partner said no. */
export async function cancelDuoPlusOne(
  supabase: SupabaseClient,
  { eventId, hostTelegramId }: { eventId: string; hostTelegramId: number },
) {
  const { error } = await supabase
    .from("event_signups")
    .update({ status: "cancelled" })
    .eq("event_id", eventId)
    .eq("duo_host_telegram_id", hostTelegramId)
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
