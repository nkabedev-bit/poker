import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";

export type MatchedClientBotUser = {
  displayName: string;
  /** The account, which every player has — a Telegram id is not. */
  id: string;
  telegramId: number | null;
  username: string | null;
};

/** Nicknames are compared by their key: "Ace High", "ace_high" and "ACEHIGH" are one. */
export function normalizeNickname(value: string) {
  return buildNicknameKey(value);
}

/**
 * Finds the questionnaire behind a hand-typed nickname, so a player added at the door
 * still earns their games, knockouts and final tables — all of which are credited to an
 * account, never to a name.
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
    .select("id, telegram_id, display_name, username")
    .eq("nickname_key", normalized)
    .limit(5);

  if (error) throw error;

  const matches = (data ?? []).map(
    (row) =>
      row as {
        display_name: string | null;
        id: string;
        telegram_id: number | null;
        username: string | null;
      },
  );

  if (matches.length !== 1) {
    return { ambiguous: matches.length > 1, user: null };
  }

  const match = matches[0];

  return {
    ambiguous: false,
    user: {
      displayName: match.display_name ?? "",
      id: match.id,
      telegramId: match.telegram_id,
      username: match.username,
    },
  };
}
