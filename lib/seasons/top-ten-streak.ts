import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { listSeasons } from "@/lib/seasons/store";

/** How high a closed season's table has to be finished on to count: the top ten. */
export const TOP_TEN_PLACES = 10;

/** One closed season's top ten, as the club announced it. */
export type SeasonTopTen = {
  id: string;
  rows: Array<{ playerName: string; telegramId: number | null }>;
  startsOn: string;
};

/** Who is being looked for in the tables: by Telegram id where both have one, else by name. */
export type SeasonPlayer = { nickname: string; telegramId: number | null };

/**
 * The top ten of every closed regular season, oldest first — what "В поле зрения" is
 * read from. A parallel season (APC) runs beside the club's own and is left out, and
 * the season still open has not finished anywhere yet.
 *
 * The tables are the ones frozen at the close, so correcting an old game never moves
 * them. Whatever cannot be read leaves the achievement at nought rather than the
 * profile broken.
 */
export async function readClosedSeasonTopTens(supabase: SupabaseClient): Promise<SeasonTopTen[]> {
  try {
    const seasons = (await listSeasons(supabase))
      .filter((season) => season.status === "closed" && !season.parallel)
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    if (seasons.length === 0) return [];

    const { data, error } = await supabase
      .from("season_standings")
      .select("season_id, player_name, telegram_id")
      .in(
        "season_id",
        seasons.map((season) => season.id),
      )
      .lte("place", TOP_TEN_PLACES);
    if (error) throw error;

    const rowsBySeason = new Map<string, SeasonTopTen["rows"]>();
    for (const row of (data ?? []) as Array<{
      player_name: string;
      season_id: string;
      telegram_id: number | null;
    }>) {
      const rows = rowsBySeason.get(row.season_id) ?? [];
      rows.push({
        playerName: row.player_name,
        telegramId: row.telegram_id === null ? null : Number(row.telegram_id),
      });
      rowsBySeason.set(row.season_id, rows);
    }

    return seasons.map((season) => ({
      id: season.id,
      rows: rowsBySeason.get(season.id) ?? [],
      startsOn: season.startsOn,
    }));
  } catch (error) {
    console.warn("Closed seasons are unavailable for the achievements", error);
    return [];
  }
}

/**
 * The longest run of closed seasons, one after another, the player finished in the top
 * ten. A season they finished lower in — or did not play at all — ends the run.
 */
export function countBestTopTenSeasonStreak(seasons: SeasonTopTen[], player: SeasonPlayer) {
  const key = buildNicknameKey(player.nickname);
  const isPlayer = (row: SeasonTopTen["rows"][number]) =>
    (player.telegramId !== null && row.telegramId === player.telegramId) ||
    (Boolean(key) && buildNicknameKey(row.playerName) === key);

  let best = 0;
  let run = 0;
  for (const season of seasons) {
    run = season.rows.some(isPlayer) ? run + 1 : 0;
    best = Math.max(best, run);
  }

  return best;
}
