import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFieldSizes,
  buildPlayerResultsFilter,
  computePlayerStats,
  countLastPlaces,
} from "@/lib/results/player-stats";

const PLAYED_GAMES_LIMIT = 300;

export type PlayedGame = {
  knockouts: number;
  place: number | null;
  /** Re-entries bought that evening; null when the game predates the column. */
  rebuys: number | null;
  startedAt: string;
};

export type PlayerProfileStats = ReturnType<typeof computePlayerStats> & { lastPlace: number };

/**
 * Everything a profile says about a player, counted from the games themselves.
 *
 * The same numbers serve the player's own profile and anyone else's: correcting a
 * result in the admin corrects every profile that game appears in, which separate
 * counters could never do.
 */
export async function readPlayerGames(
  supabase: SupabaseClient,
  { nickname, telegramId }: { nickname: string; telegramId: number | null },
): Promise<PlayedGame[]> {
  const read = (columns: string) =>
    supabase
      .from("tournament_results")
      .select(columns)
      .or(buildPlayerResultsFilter(telegramId ?? null, nickname))
      .order("started_at", { ascending: false })
      .limit(PLAYED_GAMES_LIMIT);

  // Re-entries were added to the table later and the club runs its migrations by hand,
  // so a profile still opens where the column is missing — those games simply say they
  // do not know.
  // eslint-disable-next-line prefer-const -- `data` is reassigned by the fallback read
  let { data, error } = await read("place, knockouts, started_at, rebuys");
  if (error && String(error.message ?? "").includes("rebuys")) {
    console.warn("tournament_results.rebuys is missing; reading games without it", error);
    ({ data } = await read("place, knockouts, started_at"));
  }

  return (data ?? []).map((row) => {
    const record = row as unknown as {
      knockouts: number | string | null;
      place: number | null;
      rebuys?: number | string | null;
      started_at: string;
    };

    return {
      knockouts: Number(record.knockouts ?? 0),
      place: record.place,
      rebuys: record.rebuys === null || record.rebuys === undefined ? null : Number(record.rebuys),
      startedAt: record.started_at,
    };
  });
}

export async function buildPlayerStats(
  supabase: SupabaseClient,
  played: PlayedGame[],
): Promise<PlayerProfileStats> {
  const stats = computePlayerStats(played);

  // "Last place" needs the size of each field, which only the other players' rows can
  // tell — 27th is the bottom of one tournament and the middle of another.
  let lastPlace = 0;
  if (played.length > 0) {
    const { data: fieldRows } = await supabase
      .from("tournament_results")
      .select("place, started_at")
      .in("started_at", [...new Set(played.map((row) => row.startedAt))]);

    lastPlace = countLastPlaces(
      played,
      buildFieldSizes(
        (fieldRows ?? []).map((row) => {
          const record = row as { place: number | null; started_at: string };
          return { place: record.place, startedAt: record.started_at };
        }),
      ),
    );
  }

  return { ...stats, lastPlace };
}
