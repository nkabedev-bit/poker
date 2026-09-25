import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFieldSizes,
  buildPlayerResultsFilter,
  computePlayerStats,
  countLastPlaces,
} from "@/lib/results/player-stats";
import { readAllPages } from "@/lib/supabase/read-all-pages";

/** Games asked about in one request when reading their fields: keeps the query short. */
const FIELD_GAMES_PER_REQUEST = 100;

type StoredGame = {
  knockouts: number | string | null;
  place: number | null;
  rebuys?: number | string | null;
  started_at: string;
};

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
  // Every game, however many: the achievements count them all, and a request is cut at a
  // thousand rows without a word.
  const read = (columns: string) =>
    readAllPages<StoredGame>((from, to) =>
      supabase
        .from("tournament_results")
        .select(columns)
        .or(buildPlayerResultsFilter(telegramId ?? null, nickname))
        .order("started_at", { ascending: false })
        .order("id")
        .range(from, to),
    );

  // Re-entries were added to the table later and the club runs its migrations by hand,
  // so a profile still opens where the column is missing — those games simply say they
  // do not know. Anything else leaves the profile empty rather than locked.
  let games: StoredGame[] = [];
  try {
    games = await read("place, knockouts, started_at, rebuys");
  } catch (error) {
    if (!String((error as { message?: unknown })?.message ?? "").includes("rebuys")) {
      console.error("Failed to read the player's games", error);
      return [];
    }

    console.warn("tournament_results.rebuys is missing; reading games without it", error);
    try {
      games = await read("place, knockouts, started_at");
    } catch (fallbackError) {
      console.error("Failed to read the player's games", fallbackError);
      return [];
    }
  }

  return games.map((record) => ({
    knockouts: Number(record.knockouts ?? 0),
    place: record.place,
    rebuys: record.rebuys === null || record.rebuys === undefined ? null : Number(record.rebuys),
    startedAt: record.started_at,
  }));
}

/**
 * The size of the field in each of these games — the largest place anyone took — read
 * from everybody's rows. A regular's games hold thousands of them, so they are read in
 * batches of games and pages of rows until none is left out.
 */
async function readFieldSizes(supabase: SupabaseClient, startedAt: string[]) {
  const games = [...new Set(startedAt)];
  const rows: Array<{ place: number | null; startedAt: string }> = [];

  for (let offset = 0; offset < games.length; offset += FIELD_GAMES_PER_REQUEST) {
    const batch = games.slice(offset, offset + FIELD_GAMES_PER_REQUEST);
    const page = await readAllPages<{ place: number | null; started_at: string }>((from, to) =>
      supabase
        .from("tournament_results")
        .select("place, started_at")
        .in("started_at", batch)
        .not("place", "is", null)
        .order("id")
        .range(from, to),
    );

    rows.push(...page.map((row) => ({ place: row.place, startedAt: row.started_at })));
  }

  return buildFieldSizes(rows);
}

export async function buildPlayerStats(
  supabase: SupabaseClient,
  played: PlayedGame[],
): Promise<PlayerProfileStats> {
  const stats = computePlayerStats(played);

  // "Last place" needs the size of each field, which only the other players' rows can
  // tell — 27th is the bottom of one tournament and the middle of another. Without the
  // whole field there is no telling, and the count waits rather than guesses.
  let lastPlace = 0;
  if (played.length > 0) {
    try {
      const fieldSizes = await readFieldSizes(
        supabase,
        played.map((row) => row.startedAt),
      );
      lastPlace = countLastPlaces(played, fieldSizes);
    } catch (error) {
      console.error("Failed to read the fields of the player's games", error);
    }
  }

  return { ...stats, lastPlace };
}
