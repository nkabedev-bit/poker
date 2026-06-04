"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateRemainingSeconds } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

type TimerContext = {
  tournament: {
    id: string;
    public_token: string;
    registration_minutes: number;
  };
  timerState: TimerState;
  blindLevels: BlindLevel[];
};

async function loadTimerContext(): Promise<TimerContext> {
  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token, registration_minutes")
    .limit(1)
    .single();

  if (!tournament) redirect("/admin/timer?error=no_tournament");

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

  return {
    tournament: tournament as TimerContext["tournament"],
    timerState: {
      status: state?.status ?? "not_started",
      currentLevelIndex: state?.current_level_index ?? 0,
      levelStartedAt: state?.level_started_at ?? null,
      pausedRemainingSeconds: state?.paused_remaining_seconds ?? null,
      registrationClosesAt: state?.registration_closes_at ?? null,
      finishedAt: state?.finished_at ?? null,
    },
    blindLevels: (levels ?? []).map((row) => ({
      id: row.id as string,
      levelOrder: row.level_order as number,
      smallBlind: row.small_blind as number | null,
      bigBlind: row.big_blind as number | null,
      ante: row.ante as number | null,
      durationSeconds: row.duration_seconds as number,
      isBreak: row.is_break as boolean,
      breakDurationSeconds: row.break_duration_seconds as number | null,
    })),
  };
}

async function updateTimerState(values: Record<string, unknown>) {
  const context = await loadTimerContext();
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("timer_state")
    .update(values)
    .eq("tournament_id", context.tournament.id);

  await broadcastPublicState(context.tournament.public_token);
  revalidatePath("/admin/timer");
}

export async function startTimer() {
  const context = await loadTimerContext();
  const now = new Date();
  const registrationClosesAt =
    context.tournament.registration_minutes > 0
      ? new Date(now.getTime() + context.tournament.registration_minutes * 60_000)
      : null;

  await updateTimerState({
    status: "running",
    level_started_at: now.toISOString(),
    paused_remaining_seconds: null,
    registration_closes_at: registrationClosesAt?.toISOString() ?? null,
    finished_at: null,
  });
}

export async function pauseTimer() {
  const context = await loadTimerContext();
  const remaining = calculateRemainingSeconds(
    context.timerState,
    context.blindLevels,
    new Date(),
  );

  await updateTimerState({
    status: "paused",
    paused_remaining_seconds: remaining,
  });
}

export async function resumeTimer() {
  const context = await loadTimerContext();
  const current = context.blindLevels[context.timerState.currentLevelIndex] ?? null;
  const duration = current?.durationSeconds ?? 0;
  const remaining = context.timerState.pausedRemainingSeconds ?? duration;
  const startedAt = new Date(Date.now() - (duration - remaining) * 1000);

  await updateTimerState({
    status: "running",
    level_started_at: startedAt.toISOString(),
    paused_remaining_seconds: null,
  });
}

export async function nextLevel() {
  const context = await loadTimerContext();
  const nextIndex = Math.min(
    context.timerState.currentLevelIndex + 1,
    Math.max(0, context.blindLevels.length - 1),
  );

  await updateTimerState({
    status: "running",
    current_level_index: nextIndex,
    level_started_at: new Date().toISOString(),
    paused_remaining_seconds: null,
  });
}

export async function previousLevel() {
  const context = await loadTimerContext();
  const previousIndex = Math.max(0, context.timerState.currentLevelIndex - 1);

  await updateTimerState({
    status: "running",
    current_level_index: previousIndex,
    level_started_at: new Date().toISOString(),
    paused_remaining_seconds: null,
  });
}

export async function closeRegistration() {
  const context = await loadTimerContext();
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("tournaments")
    .update({ registration_status: "closed" })
    .eq("id", context.tournament.id);

  await broadcastPublicState(context.tournament.public_token);
  revalidatePath("/admin/timer");
}

export async function finishTournament() {
  await updateTimerState({
    status: "finished",
    finished_at: new Date().toISOString(),
    paused_remaining_seconds: null,
  });
}
