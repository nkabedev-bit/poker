import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { normalizeClientBotText } from "@/lib/client-bot/registration";

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

type BirthDate = { day: string; month: string; year: string | null };

/**
 * A date of birth in one shape, so 01.02.2003 and 1.2.2003 are the same day.
 *
 * The year is optional because for half the club it was never written down: the
 * questionnaire used to be a conversation in the bot, and the spreadsheet it wrote to
 * keeps the day and the month alone.
 */
function readBirthDate(value: unknown): BirthDate | null {
  const text = normalizeClientBotText(typeof value === "string" ? value : "");
  const match = text.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  return {
    day: match[1].padStart(2, "0"),
    month: match[2].padStart(2, "0"),
    year: match[3] ?? null,
  };
}

/**
 * Whether the date the player typed is the one on file.
 *
 * Where the club recorded a year, it has to match. Where it did not, the day and the
 * month are the whole of what can be checked — still a date nobody but the player and
 * the club knows, against a nickname anybody can read off the rating.
 */
function sameBirthDate(onFile: BirthDate, given: BirthDate) {
  if (onFile.day !== given.day || onFile.month !== given.month) return false;

  return onFile.year === null || onFile.year === given.year;
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
  // The player always gives the whole date; only what the club stored may be short of a
  // year. Read before it is judged, so 7.3.1991 is not turned away over two zeros.
  const given = readBirthDate(birthDate);
  if (!key || !given?.year) return { error: "wrong_details", account: null };

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

  const onFile = readBirthDate(existing.pending_profile_answers?.birthDate);
  // A profile the club has no date for at all cannot be claimed here — an admin has to
  // hand it over.
  if (!onFile) return { error: "no_birth_date", account: null };
  if (!sameBirthDate(onFile, given)) return { error: "wrong_details", account: null };

  return { error: null, account: { id: existing.id } };
}
