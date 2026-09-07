import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSignupStatus, EventTicketType } from "@/lib/events/types";

export type SignupClaim = {
  duoConfirmedAt: string | null;
  duoInviteToken: string | null;
  duoPartnerName: string | null;
  duoPartnerUserId: string | null;
  eventId: string;
  status: EventSignupStatus;
  telegramId: number | null;
  ticketType: EventTicketType;
  usePass: string;
  userId: string;
};

/** The poster was full by the time the write reached the room. */
export const SIGNUP_FULL = "full" as const;

function isMissingRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "PGRST202" || String(message ?? "").includes("claim_event_signup");
}

function isEventFull(error: unknown) {
  if (!error || typeof error !== "object") return false;

  return String((error as { message?: unknown }).message ?? "").includes("Event is full");
}

/**
 * Writes a sign-up, counting the room in the same breath.
 *
 * Reading the free seats and writing the sign-up were two trips to the database, and
 * between them the last place could go to somebody else: two players tapping at once
 * both read "one left" and both got it, so the club sold one more seat than it opened.
 * The database counts under the poster's own row lock and refuses the loser — the same
 * defence the seating plan already has, so two taps cannot fill one chair.
 *
 * Returns "full" when the room ran out, or null when the write went through.
 */
export async function claimEventSignup(
  supabase: SupabaseClient,
  claim: SignupClaim,
): Promise<typeof SIGNUP_FULL | null> {
  const { error } = await supabase.rpc("claim_event_signup", {
    p_duo_confirmed_at: claim.duoConfirmedAt,
    p_duo_invite_token: claim.duoInviteToken,
    p_duo_partner_name: claim.duoPartnerName,
    p_duo_partner_user_id: claim.duoPartnerUserId,
    p_event_id: claim.eventId,
    p_status: claim.status,
    p_telegram_id: claim.telegramId,
    p_ticket_type: claim.ticketType,
    p_use_pass: claim.usePass,
    p_user_id: claim.userId,
  });

  if (!error) return null;
  if (isEventFull(error)) return SIGNUP_FULL;
  // The function is applied by hand, so a deploy can land before it exists. Until then
  // the plain write stands in: the race is rarer than a sign-up that cannot be made.
  if (!isMissingRpc(error)) throw error;

  return writeWithoutCounting(supabase, claim);
}

/** What the route did before the function existed. Kept only as a fallback. */
async function writeWithoutCounting(supabase: SupabaseClient, claim: SignupClaim) {
  const { error } = await supabase.from("event_signups").upsert(
    {
      duo_confirmed_at: claim.duoConfirmedAt,
      duo_invite_token: claim.duoInviteToken,
      duo_partner_name: claim.duoPartnerName,
      duo_partner_user_id: claim.duoPartnerUserId,
      event_id: claim.eventId,
      status: claim.status,
      telegram_id: claim.telegramId,
      ticket_type: claim.ticketType,
      use_pass: claim.usePass,
      user_id: claim.userId,
    },
    { onConflict: "event_id,user_id" },
  );

  if (error) throw error;

  return null;
}
