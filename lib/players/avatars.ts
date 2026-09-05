import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";

/**
 * A face in two sizes: the full picture for a profile, and the thumbnail the lists
 * draw. An account photographed before thumbnails existed has only the full one, and
 * falls back to it rather than showing a letter.
 */
export type PlayerAvatar = { thumbUrl: string | null; url: string | null };

export type AvatarLookup = {
  /**
   * The face for one player as a table spells them: by the account the game recorded,
   * and failing that by the nickname, which is all the imported sheets know.
   */
  find: (player: { name?: string | null; telegramId?: number | null }) => PlayerAvatar;
};

type AccountRow = {
  avatar_thumb_url: string | null;
  avatar_url: string | null;
  display_name: string | null;
  /** Null on an account that signed in on the web; the nickname finds those. */
  telegram_id: number | null;
};

const NO_AVATAR: PlayerAvatar = { thumbUrl: null, url: null };

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
    .select("telegram_id, display_name, avatar_url, avatar_thumb_url")
    .not("display_name", "is", null);

  const byTelegramId = new Map<number, PlayerAvatar>();
  const byNickname = new Map<string, PlayerAvatar>();

  for (const row of (data ?? []) as AccountRow[]) {
    const avatar = { thumbUrl: row.avatar_thumb_url ?? row.avatar_url, url: row.avatar_url };

    if (row.telegram_id !== null) byTelegramId.set(row.telegram_id, avatar);
    const nickname = buildNicknameKey(row.display_name ?? "");
    if (nickname) byNickname.set(nickname, avatar);
  }

  return {
    find: ({ name, telegramId }) =>
      (telegramId ? byTelegramId.get(telegramId) : undefined) ??
      byNickname.get(buildNicknameKey(name ?? "")) ??
      NO_AVATAR,
  };
}
