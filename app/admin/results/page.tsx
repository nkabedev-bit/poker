import { ResultsManager } from "@/components/admin/results-manager";
import { hasPublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RECENT_ROWS_LIMIT = 2000;

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
  const { data } = await supabase
    .from("tournament_results")
    .select("started_at, played_on, title, player_name, place, points, knockouts, telegram_id, counts_for_rating")
    .order("started_at", { ascending: false })
    .limit(RECENT_ROWS_LIMIT);

  const rows = (data ?? []) as ResultRow[];

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

  return (
    <ResultsManager
      key={selectedGame ?? "none"}
      games={games}
      rows={rows
        .filter((row) => row.started_at === selectedGame)
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
