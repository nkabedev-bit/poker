import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";

export type AvatarLookup = {
  /**
   * The face for one player as a table spells them: by the account the game recorded,
   * and failing that by the nickname, which is all the imported sheets know.
   */
  find: (player: { name?: string | null; telegramId?: number | null }) => string | null;
};

type AccountRow = {
  avatar_url: string | null;
  display_name: string | null;
  telegram_id: number;
};

/**
 * Every face the club has, ready to hang on any table of players.
 *
 * A game is stored as names and, where the player is registered, a Telegram id; the
 * avatar lives on the account. Loading the accounts once and matching in memory keeps
 * one lookup for the rating, the finishing table and anything else that lists players.
 */
export async function loadPlayerAvatars(supabase: SupabaseClient): Promise<AvatarLookup> {
  const { data } = await supabase
    .from("client_bot_users")
    .select("telegram_id, display_name, avatar_url")
    .not("display_name", "is", null);

  const byTelegramId = new Map<number, string | null>();
  const byNickname = new Map<string, string | null>();

  for (const row of (data ?? []) as AccountRow[]) {
    byTelegramId.set(row.telegram_id, row.avatar_url);
    const nickname = buildNicknameKey(row.display_name ?? "");
    if (nickname) byNickname.set(nickname, row.avatar_url);
  }

  return {
    find: ({ name, telegramId }) =>
      (telegramId ? byTelegramId.get(telegramId) : undefined) ??
      byNickname.get(buildNicknameKey(name ?? "")) ??
      null,
  };
}
