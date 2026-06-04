import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { getEffectiveTimerState } from "@/lib/timer/calculate";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";
import {
  loadCurrentTournamentContext,
  saveTournamentExtrasFromContext,
} from "@/lib/client-bot/server";
import { TimerState, BlindLevel } from "@/lib/timer/types";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const action = (await params).action;

  try {
    const { data: t } = await auth.supabase
      .from("tournaments")
      .select("id, public_token, registration_minutes")
      .limit(1)
      .single();

    if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

    const { data: stateData } = await auth.supabase
      .from("timer_state")
      .select("*")
      .eq("tournament_id", t.id)
      .single();

    const { data: levelsData } = await auth.supabase
      .from("blind_levels")
      .select("*")
      .eq("tournament_id", t.id)
      .order("level_order");

    const timerState: TimerState = {
      status: stateData.status,
      currentLevelIndex: stateData.current_level_index,
      levelStartedAt: stateData.level_started_at,
      pausedRemainingSeconds: stateData.paused_remaining_seconds,
      registrationClosesAt: stateData.registration_closes_at,
      finishedAt: stateData.finished_at,
    };

    const blindLevels: BlindLevel[] = (levelsData || []).map((row) => ({
      id: row.id,
      levelOrder: row.level_order,
      smallBlind: row.small_blind,
      bigBlind: row.big_blind,
      ante: row.ante,
      reentryCloses: Boolean(row.reentry_closes),
      durationSeconds: row.duration_seconds,
      isBreak: row.is_break,
      breakDurationSeconds: row.break_duration_seconds,
    }));

    const now = new Date();

    if (action === "start") {
      if (timerState.status === "paused") {
        const current = blindLevels[timerState.currentLevelIndex];
        const duration = current?.durationSeconds ?? 0;
        const remaining = timerState.pausedRemainingSeconds ?? duration;
        const startedAt = new Date(Date.now() - (duration - remaining) * 1000);

        await auth.supabase.from("timer_state").update({
          status: "running",
          level_started_at: startedAt.toISOString(),
          paused_remaining_seconds: null,
        }).eq("tournament_id", t.id);
      } else {
        const registrationClosesAt = t.registration_minutes > 0
          ? new Date(now.getTime() + t.registration_minutes * 60_000)
          : null;

        await auth.supabase.from("timer_state").update({
          status: "running",
          current_level_index: 0,
          level_started_at: now.toISOString(),
          paused_remaining_seconds: null,
          registration_closes_at: registrationClosesAt?.toISOString() ?? null,
          finished_at: null,
        }).eq("tournament_id", t.id);

        const context = await loadCurrentTournamentContext(auth.supabase);
        if (context) {
          await saveTournamentExtrasFromContext(
            auth.supabase,
            context,
            { settings: { sheetsSessionStartedAt: now.toISOString(), statsCountedAt: null } },
          );
        }
      }
    } else if (action === "pause") {
      const { remainingSeconds, currentLevelIndex } = getEffectiveTimerState(timerState, blindLevels, now);
      await auth.supabase.from("timer_state").update({
        status: "paused",
        current_level_index: currentLevelIndex,
        paused_remaining_seconds: remainingSeconds,
      }).eq("tournament_id", t.id);
    } else if (action === "next") {
      const { currentLevelIndex } = getEffectiveTimerState(timerState, blindLevels, now);
      const nextIndex = Math.min(currentLevelIndex + 1, Math.max(0, blindLevels.length - 1));
      await auth.supabase.from("timer_state").update({
        status: "running",
        current_level_index: nextIndex,
        level_started_at: now.toISOString(),
        paused_remaining_seconds: null,
      }).eq("tournament_id", t.id);
    } else if (action === "previous") {
      const { currentLevelIndex } = getEffectiveTimerState(timerState, blindLevels, now);
      const previousIndex = Math.max(0, currentLevelIndex - 1);
      await auth.supabase.from("timer_state").update({
        status: "running",
        current_level_index: previousIndex,
        level_started_at: now.toISOString(),
        paused_remaining_seconds: null,
      }).eq("tournament_id", t.id);
    } else if (action === "finish") {
      await auth.supabase.from("timer_state").update({
        status: "finished",
        current_level_index: 0,
        finished_at: now.toISOString(),
        paused_remaining_seconds: null,
      }).eq("tournament_id", t.id);

      const context = await loadCurrentTournamentContext(auth.supabase);
      if (context) {
        await saveTournamentExtrasFromContext(
          auth.supabase,
          context,
          getFinishTournamentExtrasPatch(),
        );
      }

      const { error: statsError } = await auth.supabase.rpc("accumulate_client_bot_stats", {
        p_tournament_id: t.id,
      });
      if (statsError) {
        console.error("Failed to accumulate client bot stats", statsError);
      }
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await broadcastPublicState(t.public_token);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
