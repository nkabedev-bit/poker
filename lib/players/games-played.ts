import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";

const PAGE_SIZE = 1000;

/**
 * How many evenings each of these players has behind them, keyed by nickname.
 *
 * Counted from the games themselves rather than a stored counter, so the club's own
 * imported history counts towards a player's tier from the first night the feature is
 * switched on. Evenings, not rows: a game recorded twice must not promote anyone.
 */
export async function countGamesByNickname(
  supabase: SupabaseClient,
  nicknames: string[],
): Promise<Map<string, number>> {
  const keys = [...new Set(nicknames.map(buildNicknameKey).filter(Boolean))];
  const evenings = new Map<string, Set<string>>();

  for (let offset = 0; offset < keys.length; offset += 50) {
    const batch = keys.slice(offset, offset + 50);
    if (batch.length === 0) continue;

    for (let page = 0; ; page += 1) {
      const { data, error } = await supabase
        .from("tournament_results")
        .select("player_key, played_on")
        .in("player_key", batch)
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (error) throw error;

      const rows = (data ?? []) as Array<{ played_on: string; player_key: string }>;
      for (const row of rows) {
        const played = evenings.get(row.player_key) ?? new Set<string>();
        played.add(row.played_on);
        evenings.set(row.player_key, played);
      }

      if (rows.length < PAGE_SIZE) break;
    }
  }

  return new Map([...evenings].map(([key, played]) => [key, played.size]));
}
