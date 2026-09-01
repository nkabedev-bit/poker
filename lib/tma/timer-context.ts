import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

/**
 * Loads the timer state and blind structure of a tournament in the row -> domain
 * shape every TMA route needs before it can judge re-entry availability.
 */
export async function loadTimerContext(supabase: SupabaseClient, tournamentId: string) {
  const { data: timerRow } = await supabase
    .from("timer_state")
    .select("*")
    .eq("tournament_id", tournamentId)
    .single();
  const { data: levelRows } = await supabase
    .from("blind_levels")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("level_order");

  const timerState: TimerState = {
    status: timerRow?.status ?? "not_started",
    currentLevelIndex: timerRow?.current_level_index ?? 0,
    levelStartedAt: timerRow?.level_started_at ?? null,
    pausedRemainingSeconds: timerRow?.paused_remaining_seconds ?? null,
    registrationClosesAt: timerRow?.registration_closes_at ?? null,
    finishedAt: timerRow?.finished_at ?? null,
  };

  const blindLevels: BlindLevel[] = (levelRows ?? []).map((row) => ({
    id: row.id,
    levelOrder: row.level_order,
    smallBlind: row.small_blind,
    bigBlind: row.big_blind,
    ante: row.ante,
    reentryCloses: Boolean(row.reentry_closes),
    doubleReentryAvailable: Boolean(row.double_reentry_available),
    durationSeconds: row.duration_seconds,
    isBreak: row.is_break,
    breakDurationSeconds: row.break_duration_seconds,
  }));

  return { blindLevels, timerState };
}
