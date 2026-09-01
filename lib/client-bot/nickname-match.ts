import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeClientBotText } from "@/lib/client-bot/registration";

export type MatchedClientBotUser = {
  displayName: string;
  telegramId: number;
  username: string | null;
};

/** Nicknames are compared with case and stray spacing ignored: "Ace High" is "ace  high". */
export function normalizeNickname(value: string) {
  return normalizeClientBotText(value).toLocaleLowerCase("ru-RU");
}

// PostgREST passes the pattern straight to ILIKE, where these are wildcards.
function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Finds the questionnaire behind a hand-typed nickname, so a player added at the door
 * still earns their games, knockouts and final tables — all of which are credited by
 * Telegram id, never by name.
 *
 * Returns null when nobody matches, and also when several players share the nickname:
 * crediting the wrong person is worse than crediting nobody, and the admin is told.
 */
export async function findClientBotUserByNickname(
  supabase: SupabaseClient,
  nickname: string,
): Promise<{ ambiguous: boolean; user: MatchedClientBotUser | null }> {
  const normalized = normalizeNickname(nickname);
  if (!normalized) return { ambiguous: false, user: null };

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("telegram_id, display_name, username")
    .ilike("display_name", escapeLikePattern(normalized))
    .limit(5);

  if (error) throw error;

  const matches = (data ?? [])
    .map((row) => row as { display_name: string | null; telegram_id: number; username: string | null })
    .filter((row) => normalizeNickname(row.display_name ?? "") === normalized);

  if (matches.length !== 1) {
    return { ambiguous: matches.length > 1, user: null };
  }

  const match = matches[0];

  return {
    ambiguous: false,
    user: {
      displayName: match.display_name ?? "",
      telegramId: match.telegram_id,
      username: match.username,
    },
  };
}
