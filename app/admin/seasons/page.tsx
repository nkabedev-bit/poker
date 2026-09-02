import { SeasonsManager } from "@/components/admin/seasons-manager";
import { hasPublicEnv } from "@/lib/env";
import { listSeasons } from "@/lib/seasons/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UNCLAIMED_ROWS_LIMIT = 20000;

export default async function SeasonsPage() {
  if (!hasPublicEnv()) return <SeasonsManager gamesWithoutSeason={0} seasons={[]} />;

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

  return <SeasonsManager gamesWithoutSeason={gamesWithoutSeason} seasons={seasons} />;
}
