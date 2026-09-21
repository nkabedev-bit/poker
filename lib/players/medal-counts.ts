import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPlayerResultsFilter } from "@/lib/results/player-stats";
import { isMedalKey } from "@/lib/client/medals";

/**
 * Медали за турниры, которых клуб больше не проводит.
 *
 * Считать их из игр нельзя: часть этих вечеров сыграна до того, как результаты начали
 * записываться. Клуб помнит их сам, и колонка — единственный источник.
 *
 * Читается отдельным запросом: колонка приезжает миграцией 202609210002, и пока её не
 * применили, профиль обязан открыться без архивной секции, а не упасть целиком.
 */
export async function readArchiveMedals(
  supabase: SupabaseClient,
  accountId: string | null,
): Promise<Record<string, number>> {
  if (!accountId) return {};

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("archive_medals")
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    console.warn("Archive medals are unavailable", error.message);
    return {};
  }

  const source = (data as { archive_medals?: Record<string, unknown> | null } | null)
    ?.archive_medals;
  const counts: Record<string, number> = {};

  for (const [key, value] of Object.entries(source ?? {})) {
    const count = Math.floor(Number(value));
    if (Number.isFinite(count) && count > 0) counts[key] = count;
  }

  return counts;
}

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
