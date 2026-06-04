import { TimerControls } from "@/components/admin/timer-controls";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

export const dynamic = "force-dynamic";

export default async function TimerPage() {
  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, registration_status")
    .limit(1)
    .single();

  if (!tournament) return <div className="poker-panel">Турнир не найден.</div>;

  const { data: state } = await supabase
    .from("timer_state")
    .select("status, current_level_index, level_started_at, paused_remaining_seconds, registration_closes_at, finished_at")
    .eq("tournament_id", tournament.id)
    .single();

  const { data: levels } = await supabase
    .from("blind_levels")
    .select("id, level_order, small_blind, big_blind, ante, duration_seconds, is_break, break_duration_seconds")
    .eq("tournament_id", tournament.id)
    .order("level_order", { ascending: true });

  const timerState: TimerState = {
    status: state?.status ?? "not_started",
    currentLevelIndex: state?.current_level_index ?? 0,
    levelStartedAt: state?.level_started_at ?? null,
    pausedRemainingSeconds: state?.paused_remaining_seconds ?? null,
    registrationClosesAt: state?.registration_closes_at ?? null,
    finishedAt: state?.finished_at ?? null,
  };

  const blindLevels: BlindLevel[] = (levels ?? []).map((row) => ({
    id: row.id as string,
    levelOrder: row.level_order as number,
    smallBlind: row.small_blind as number | null,
    bigBlind: row.big_blind as number | null,
    ante: row.ante as number | null,
    durationSeconds: row.duration_seconds as number,
    isBreak: row.is_break as boolean,
    breakDurationSeconds: row.break_duration_seconds as number | null,
  }));

  return (
    <TimerControls
      blindLevels={blindLevels}
      registrationStatus={tournament.registration_status as "open" | "closed"}
      timerState={timerState}
    />
  );
}
