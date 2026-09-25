import { ResultsManager } from "@/components/admin/results-manager";
import { hasPublicEnv } from "@/lib/env";
import { readAllPages } from "@/lib/supabase/read-all-pages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RECENT_ROWS_LIMIT = 2000;

const RESULT_COLUMNS =
  "started_at, played_on, title, player_name, place, points, knockouts, telegram_id, counts_for_rating";

type ResultRow = {
  counts_for_rating: boolean | null;
  knockouts: number | string | null;
  place: number | null;
  played_on: string;
  player_name: string;
  points: number | string | null;
  started_at: string;
  telegram_id: number | null;
  title: string;
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  if (!hasPublicEnv()) {
    return <ResultsManager games={[]} rows={[]} selectedGame={null} />;
  }

  const supabase = await createSupabaseServerClient();
  // The recent evenings, a page at a time: one request stops at a thousand rows, however
  // many it asks for, and the list came up shorter than it meant to be.
  const recent = await readAllPages<ResultRow>(
    (from, to) =>
      supabase
        .from("tournament_results")
        .select(RESULT_COLUMNS)
        .order("started_at", { ascending: false })
        .order("id")
        .range(from, to),
    { maxRows: RECENT_ROWS_LIMIT },
  );

  // A full window may end partway through an evening; that evening is left off rather
  // than listed with only some of its players.
  const rows =
    recent.length === RECENT_ROWS_LIMIT
      ? recent.filter((row) => row.started_at !== recent.at(-1)?.started_at)
      : recent;

  // One entry per evening, newest first — the grouping the admin thinks in.
  const gamesByStart = new Map<
    string,
    { countsForRating: boolean; players: number; playedOn: string; startedAt: string; title: string }
  >();
  for (const row of rows) {
    const game = gamesByStart.get(row.started_at);
    gamesByStart.set(row.started_at, {
      countsForRating: row.counts_for_rating !== false,
      playedOn: row.played_on,
      players: (game?.players ?? 0) + 1,
      startedAt: row.started_at,
      title: row.title,
    });
  }

  const games = [...gamesByStart.values()];
  const selectedGame = (await searchParams).game ?? games[0]?.startedAt ?? null;

  // The evening being edited is read on its own, whole. Saving writes back what is in
  // the form and removes whoever is not, so an evening opened with part of its players —
  // the edge of the list, or an older one opened by its link — lost the rest on save.
  const selectedRows = selectedGame
    ? await readAllPages<ResultRow>((from, to) =>
        supabase
          .from("tournament_results")
          .select(RESULT_COLUMNS)
          .eq("started_at", selectedGame)
          .order("id")
          .range(from, to),
      )
    : [];

  return (
    <ResultsManager
      key={selectedGame ?? "none"}
      games={games}
      rows={selectedRows
        .map((row) => ({
          knockouts: Number(row.knockouts ?? 0),
          place: row.place,
          playerName: row.player_name,
          points: Number(row.points ?? 0),
          telegramId: row.telegram_id,
        }))
        .sort((a, b) => (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER))}
      selectedGame={selectedGame}
    />
  );
}
