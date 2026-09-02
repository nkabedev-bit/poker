import { SeasonsManager } from "@/components/admin/seasons-manager";
import { hasPublicEnv } from "@/lib/env";
import { listSeasons } from "@/lib/seasons/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UNCLAIMED_ROWS_LIMIT = 20000;

export default async function SeasonsPage() {
  if (!hasPublicEnv())
    return <SeasonsManager gamesBySeason={{}} gamesWithoutSeason={0} seasons={[]} />;

  const supabase = await createSupabaseServerClient();
  const seasons = await listSeasons(supabase);

  // Games nobody has claimed: imported history, or evenings played with no season open.
  // A game is one evening, not one row — every player of that evening has a row of
  // their own, so counting rows reported thirty times too many.
  const { data: unclaimed } = await supabase
    .from("tournament_results")
    .select("started_at")
    .is("season_id", null)
    .limit(UNCLAIMED_ROWS_LIMIT);

  const gamesWithoutSeason = new Set(
    (unclaimed ?? []).map((row) => String((row as { started_at: string }).started_at)),
  ).size;

  // How many evenings each season actually holds — the quickest way to see whether
  // "Привязать игры" did anything.
  const { data: attached } = await supabase
    .from("tournament_results")
    .select("season_id, started_at")
    .not("season_id", "is", null)
    .limit(UNCLAIMED_ROWS_LIMIT);

  const gamesBySeason: Record<string, number> = {};
  const seenGames = new Map<string, Set<string>>();
  for (const row of attached ?? []) {
    const record = row as { season_id: string; started_at: string };
    const games = seenGames.get(record.season_id) ?? new Set<string>();
    games.add(record.started_at);
    seenGames.set(record.season_id, games);
  }
  for (const [seasonId, games] of seenGames) gamesBySeason[seasonId] = games.size;

  return (
    <SeasonsManager
      gamesBySeason={gamesBySeason}
      gamesWithoutSeason={gamesWithoutSeason}
      seasons={seasons}
    />
  );
}
