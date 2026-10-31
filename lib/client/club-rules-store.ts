import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAcceptedCurrentRules } from "@/lib/client/club-rules";

/**
 * Whether the player has agreed to the current rules.
 *
 * Read apart from the account, so a missing column never costs the home screen. Until
 * the migration is applied the answer is "yes": an agreement that cannot be stored is
 * not worth putting in front of every player on every visit.
 */
export async function readRulesAccepted(supabase: SupabaseClient, accountId: string) {
  try {
    const { data, error } = await supabase
      .from("client_bot_users")
      .select("rules_accepted_at")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      console.warn("Rules agreement is unavailable", error.message);
      return true;
    }

    return hasAcceptedCurrentRules((data as { rules_accepted_at: string | null } | null)?.rules_accepted_at ?? null);
  } catch (error) {
    console.warn("Rules agreement is unavailable", error);
    return true;
  }
}
