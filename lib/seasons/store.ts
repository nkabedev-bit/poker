import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSeasonStandings,
  mapSeasonRow,
  type Season,
  type SeasonStanding,
} from "@/lib/seasons/season";

// Every column rather than a list of them: `parallel` arrives with migration 202609140001,
// and naming it here would break the rating screen for everyone until that is applied.
const SEASON_COLUMNS = "*";

export async function listSeasons(supabase: SupabaseClient): Promise<Season[]> {
  const { data, error } = await supabase
    .from("seasons")
    .select(SEASON_COLUMNS)
    .order("starts_on", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => mapSeasonRow(row as Record<string, unknown>));
}

/**
 * The regular season collecting tonight's game. A parallel season is open beside it, but
 * it finds its games by date and is never the one a game is stamped with.
 */
export async function getOpenRegularSeason(supabase: SupabaseClient): Promise<Season | null> {
  const { data, error } = await supabase
    .from("seasons")
    .select(SEASON_COLUMNS)
    .eq("status", "open");

  if (error) throw error;

  return (
    (data ?? [])
      .map((row) => mapSeasonRow(row as Record<string, unknown>))
      .find((season) => !season.parallel) ?? null
  );
}

/**
 * Live standings of a season. A regular season holds the games stamped with it as they
 * finished; a parallel one holds every rating game played inside its dates.
 */
export async function computeSeasonStandings(
  supabase: SupabaseClient,
  season: Season,
): Promise<SeasonStanding[]> {
  let query = supabase
    .from("tournament_results")
    .select("telegram_id, player_name, points, knockouts")
    .eq("counts_for_rating", true);

  if (season.parallel) {
    // played_on comes from the moment a game started, so an evening that runs past
    // midnight stays on the day it was played.
    query = query.gte("played_on", season.startsOn);
    if (season.endsOn) query = query.lte("played_on", season.endsOn);
  } else {
    query = query.eq("season_id", season.id);
  }

  const { data, error } = await query;

  if (error) throw error;

  return buildSeasonStandings(
    (data ?? []).map((row) => {
      const record = row as {
        knockouts: number | string | null;
        player_name: string;
        points: number | string | null;
        telegram_id: number | null;
      };

      return {
        knockouts: Number(record.knockouts ?? 0),
        playerName: record.player_name,
        points: Number(record.points ?? 0),
        telegramId: record.telegram_id,
      };
    }),
    season.countedGames,
  );
}

/** The frozen table a closed season was left with. */
export async function readSeasonSnapshot(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<SeasonStanding[]> {
  const { data, error } = await supabase
    .from("season_standings")
    .select("place, player_name, telegram_id, points, knockouts, games")
    .eq("season_id", seasonId)
    .order("place");

  if (error) throw error;

  return (data ?? []).map((row) => {
    const record = row as {
      games: number | null;
      knockouts: number | string | null;
      place: number;
      player_name: string;
      points: number | string | null;
      telegram_id: number | null;
    };

    return {
      games: Number(record.games ?? 0),
      knockouts: Number(record.knockouts ?? 0),
      place: record.place,
      playerName: record.player_name,
      points: Number(record.points ?? 0),
      telegramId: record.telegram_id,
    };
  });
}

/**
 * Freezes a season's table as it stands. Called when a season is closed and again
 * whenever an admin asks for a recount after correcting old games — never on its own,
 * so what the club announced cannot drift.
 */
export async function writeSeasonSnapshot(supabase: SupabaseClient, season: Season) {
  const standings = await computeSeasonStandings(supabase, season);

  // Some seasons exist only as imported totals — the games behind them were never kept.
  // Recomputing those from nothing would wipe the table the club announced, so an empty
  // recount leaves the existing one alone.
  if (standings.length === 0) return { rows: 0, skipped: true as const };

  const { error: clearError } = await supabase
    .from("season_standings")
    .delete()
    .eq("season_id", season.id);

  if (clearError) throw clearError;

  const { error } = await supabase.from("season_standings").insert(
    standings.map((standing) => ({
      games: standing.games,
      knockouts: standing.knockouts,
      place: standing.place,
      player_name: standing.playerName,
      points: standing.points,
      season_id: season.id,
      telegram_id: standing.telegramId,
    })),
  );

  if (error) throw error;

  return { rows: standings.length, skipped: false as const };
}
