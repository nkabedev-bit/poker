import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether the club's bot may send a player its broadcasts — announcements of upcoming
 * games and the club's news. The questionnaire asks it once, and the answer is kept with
 * the rest of the questionnaire, where the broadcast looks for it (`readBroadcastChats`).
 *
 * Only an explicit "no" turns broadcasts off: a player who has not filled the
 * questionnaire in has not refused anything, and has no answer at all.
 *
 * Null when it cannot be read: the profile screen then hides the switch rather than
 * show a state that may be wrong, and the rest of the profile still opens.
 */
export async function readNotificationsConsent(
  supabase: SupabaseClient,
  accountId: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("client_bot_users")
      .select("consent:pending_profile_answers->notificationsConsent")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      console.warn("Notifications consent is unavailable", error.message);
      return null;
    }

    return (data as { consent?: unknown } | null)?.consent !== false;
  } catch (error) {
    console.warn("Notifications consent is unavailable", error);
    return null;
  }
}

/**
 * Changes the player's answer about notifications and nothing else in the questionnaire.
 *
 * Read and written back whole rather than through a database function: that would need a
 * migration applied by hand before the switch could work. The only other writer of these
 * answers is the player's own questionnaire and nickname change, which do not run at the
 * same moment as a tap on this switch.
 */
export async function saveNotificationsConsent(
  supabase: SupabaseClient,
  accountId: string,
  enabled: boolean,
): Promise<void> {
  const { data, error } = await supabase
    .from("client_bot_users")
    .select("pending_profile_answers")
    .eq("id", accountId)
    .maybeSingle();

  if (error) throw error;

  const answers =
    ((data as { pending_profile_answers?: Record<string, unknown> | null } | null)
      ?.pending_profile_answers ?? {});

  const { error: writeError } = await supabase
    .from("client_bot_users")
    .update({ pending_profile_answers: { ...answers, notificationsConsent: enabled } })
    .eq("id", accountId);

  if (writeError) throw writeError;
}
