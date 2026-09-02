import { SeasonsManager } from "@/components/admin/seasons-manager";
import { hasPublicEnv } from "@/lib/env";
import { listSeasons } from "@/lib/seasons/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SeasonsPage() {
  if (!hasPublicEnv()) return <SeasonsManager gamesWithoutSeason={0} seasons={[]} />;

  const supabase = await createSupabaseServerClient();
  const seasons = await listSeasons(supabase);

  // Games nobody has claimed: imported history, or evenings played with no season open.
  const { count } = await supabase
    .from("tournament_results")
    .select("id", { count: "exact", head: true })
    .is("season_id", null);

  return <SeasonsManager gamesWithoutSeason={count ?? 0} seasons={seasons} />;
}
