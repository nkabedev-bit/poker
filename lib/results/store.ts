import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTournamentResultRows } from "@/lib/results/tournament-results";
import { getOpenSeason } from "@/lib/seasons/store";
import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";
import { resolveMedalKey } from "@/lib/client/medals";

/**
 * Resolves what the game was called. A published poster for the same day gives the
 * name players saw when they signed up ("ONE SHOT KNOCKOUT"); without one the
 * tournament's own name has to do.
 */
async function resolveGameTitle(
  supabase: SupabaseClient,
  startedAt: Date,
  fallbackTitle: string,
) {
  const dayStart = new Date(startedAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const { data } = await supabase
    .from("tournament_events")
    .select("id, title")
    .eq("is_published", true)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();

  const event = data as { id: string; title: string } | null;

  return { eventId: event?.id ?? null, title: event?.title || fallbackTitle };
}

/**
 * Stores the finishing table of a tournament. Called at the moment the game ends and
 * before the roster is wiped, so the evening survives as history.
 *
 * Writing the same game twice is harmless: the rows are keyed by start time and player.
 */
export async function saveTournamentResults({
  extras,
  players,
  supabase,
  tournamentId,
}: {
  extras: TournamentExtras;
  players: TournamentPlayer[];
  supabase: SupabaseClient;
  tournamentId: string;
}) {
  const rows = buildTournamentResultRows(players, {
    bountyPoints: extras.pts.bountyPoints,
    bountyType: extras.settings.bountyType,
    placePoints: extras.pts.placePoints,
  });

  if (rows.length === 0) return { saved: 0 };

  // The session start is what tells two games on the same date apart.
  const startedAt = new Date(extras.settings.sheetsSessionStartedAt ?? Date.now());
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name")
    .eq("id", tournamentId)
    .maybeSingle();

  // Games belong to the season that was collecting them, not to whatever period a date
  // could be read as later. With no season open the game is stored outside the rating.
  const season = await getOpenSeason(supabase);

  const { eventId, title } = await resolveGameTitle(
    supabase,
    startedAt,
    (tournament as { name?: string } | null)?.name || "Турнир",
  );

  // Which of the club's tournaments this was, written on every row of it: a first place
  // here is the medal, and deleting the game takes the medal with it.
  const medalKey = resolveMedalKey(extras.settings);

  const { error } = await supabase.from("tournament_results").upsert(
    rows.map((row) => ({
      event_id: eventId,
      medal_key: medalKey,
      knockouts: row.knockouts,
      place: row.place,
      played_on: startedAt.toISOString().slice(0, 10),
      season_id: season?.id ?? null,
      player_name: row.playerName,
      points: row.points,
      source: "app",
      started_at: startedAt.toISOString(),
      telegram_id: row.telegramId,
      title,
      tournament_id: tournamentId,
    })),
    { onConflict: "started_at,player_name" },
  );

  if (error && String(error.message ?? "").includes("medal_key")) {
    console.warn("Migration 202609050010 is not applied; storing results without the medal");

    const { error: legacyError } = await supabase.from("tournament_results").upsert(
      rows.map((row) => ({
        event_id: eventId,
        knockouts: row.knockouts,
        place: row.place,
        played_on: startedAt.toISOString().slice(0, 10),
        season_id: season?.id ?? null,
        player_name: row.playerName,
        points: row.points,
        source: "app",
        started_at: startedAt.toISOString(),
        telegram_id: row.telegramId,
        title,
        tournament_id: tournamentId,
      })),
      { onConflict: "started_at,player_name" },
    );

    if (legacyError) throw legacyError;
    return { saved: rows.length };
  }

  if (error) throw error;

  return { saved: rows.length };
}
