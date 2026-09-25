import { SeasonsManager } from "@/components/admin/seasons-manager";
import { hasPublicEnv } from "@/lib/env";
import { listSeasons } from "@/lib/seasons/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readAllPages } from "@/lib/supabase/read-all-pages";

export const dynamic = "force-dynamic";

/**
 * Rows behind the counts below, every one of them: a single request stops at a thousand,
 * which reported a fraction of the club's imported history. The counts are only a guide,
 * so a failed read shows zero rather than taking the seasons screen down with it.
 */
async function readEveryStart(
  read: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
) {
  try {
    return await readAllPages<{ season_id?: string; started_at: string }>(read);
  } catch (error) {
    console.error("Failed to count the seasons' games", error);
    return [];
  }
}

export default async function SeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const notice = (await searchParams).error ?? null;

  if (!hasPublicEnv())
    return (
      <SeasonsManager gamesBySeason={{}} gamesWithoutSeason={0} notice={notice} seasons={[]} />
    );

  const supabase = await createSupabaseServerClient();
  const seasons = await listSeasons(supabase);

  // Games nobody has claimed: imported history, or evenings played with no season open.
  // A game is one evening, not one row — every player of that evening has a row of
  // their own, so counting rows reported thirty times too many.
  const unclaimed = await readEveryStart((from, to) =>
    supabase
      .from("tournament_results")
      .select("started_at")
      .is("season_id", null)
      .order("id")
      .range(from, to),
  );

  const gamesWithoutSeason = new Set(unclaimed.map((row) => String(row.started_at))).size;

  // How many evenings each season actually holds — the quickest way to see whether
  // "Привязать игры" did anything.
  const attached = await readEveryStart((from, to) =>
    supabase
      .from("tournament_results")
      .select("season_id, started_at")
      .not("season_id", "is", null)
      .order("id")
      .range(from, to),
  );

  const gamesBySeason: Record<string, number> = {};
  const seenGames = new Map<string, Set<string>>();
  for (const row of attached) {
    const record = row as { season_id: string; started_at: string };
    const games = seenGames.get(record.season_id) ?? new Set<string>();
    games.add(record.started_at);
    seenGames.set(record.season_id, games);
  }
  for (const [seasonId, games] of seenGames) gamesBySeason[seasonId] = games.size;

  // A parallel season is never stamped on games: its evenings are the rating games played
  // inside its dates.
  for (const season of seasons.filter((item) => item.parallel)) {
    const rows = await readEveryStart((from, to) => {
      let query = supabase
        .from("tournament_results")
        .select("started_at")
        .eq("counts_for_rating", true)
        .gte("played_on", season.startsOn);

      if (season.endsOn) query = query.lte("played_on", season.endsOn);
      return query.order("id").range(from, to);
    });
    gamesBySeason[season.id] = new Set(rows.map((row) => String(row.started_at))).size;
  }

  return (
    <SeasonsManager
      gamesBySeason={gamesBySeason}
      gamesWithoutSeason={gamesWithoutSeason}
      notice={notice}
      seasons={seasons}
    />
  );
}
