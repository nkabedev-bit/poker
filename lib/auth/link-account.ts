import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { isValidBirthDate, normalizeClientBotText } from "@/lib/client-bot/registration";

/**
 * Claiming the profile a returning player already has.
 *
 * The nickname alone cannot be the proof: nicknames are on the public rating for anyone
 * to read, and a profile carries the player's history and their free entries. The date
 * of birth off their questionnaire is the second half — it is not on any screen, and
 * the honest player types it in five seconds.
 */
export type LinkOutcome =
  | { error: "already_linked" | "no_birth_date" | "not_found" | "wrong_details"; account: null }
  | { error: null; account: { id: string } };

/** Both sides of the comparison in one shape, so 01.02.2003 and 1.2.2003 are one date. */
function normalizeBirthDate(value: unknown) {
  const text = normalizeClientBotText(typeof value === "string" ? value : "");
  const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return "";

  return `${match[1].padStart(2, "0")}.${match[2].padStart(2, "0")}.${match[3]}`;
}

export async function linkExistingAccount(
  supabase: SupabaseClient,
  {
    birthDate,
    newAccountId,
    nickname,
  }: { birthDate: string; newAccountId: string; nickname: string },
): Promise<LinkOutcome> {
  const key = buildNicknameKey(nickname);
  // Padded before it is judged, so a player who types 7.3.1991 is not turned away over
  // the two zeros they left out.
  const given = normalizeBirthDate(birthDate);
  if (!key || !isValidBirthDate(given)) return { error: "wrong_details", account: null };

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("id, yandex_id, pending_profile_answers")
    .eq("nickname_key", key)
    .neq("id", newAccountId)
    .limit(2);

  if (error) throw error;

  const matches = (data ?? []) as Array<{
    id: string;
    pending_profile_answers: { birthDate?: unknown } | null;
    yandex_id: string | null;
  }>;

  // Two accounts under one nickname cannot be told apart by it, and guessing would hand
  // somebody the wrong history.
  if (matches.length !== 1) return { error: "not_found", account: null };

  const existing = matches[0];
  if (existing.yandex_id) return { error: "already_linked", account: null };

  const onFile = normalizeBirthDate(existing.pending_profile_answers?.birthDate);
  // A profile from before the questionnaire moved into the app has no date to check
  // against, and there is nothing safe to do about that here.
  if (!onFile) return { error: "no_birth_date", account: null };
  if (onFile !== given) return { error: "wrong_details", account: null };

  return { error: null, account: { id: existing.id } };
}
