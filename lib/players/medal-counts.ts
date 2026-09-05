import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPlayerResultsFilter } from "@/lib/results/player-stats";
import { isMedalKey } from "@/lib/client/medals";

/**
 * The medals the stored results account for: one per tournament this player won, by the
 * kind of tournament it was.
 *
 * Counted from the games rather than tallied when each one ended, so a game deleted or
 * corrected in the admin takes its medal with it — the same way the rest of a profile
 * already behaves.
 */
export async function countMedalsFromResults(
  supabase: SupabaseClient,
  { nickname, telegramId }: { nickname: string; telegramId: number | null },
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("tournament_results")
    .select("medal_key")
    .eq("place", 1)
    .not("medal_key", "is", null)
    .or(buildPlayerResultsFilter(telegramId, nickname));

  // The column arrives with 202609050010. Until it does, a profile shows the club's own
  // record alone rather than refusing to open.
  if (error) {
    console.warn("Medals cannot be counted from the results", error.message);
    return {};
  }

  const counts: Record<string, number> = {};

  for (const row of (data ?? []) as Array<{ medal_key: unknown }>) {
    if (!isMedalKey(row.medal_key)) continue;
    counts[row.medal_key] = (counts[row.medal_key] ?? 0) + 1;
  }

  return counts;
}
