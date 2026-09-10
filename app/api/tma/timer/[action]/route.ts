import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { getEffectiveTimerState, getLevelDuration } from "@/lib/timer/calculate";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";
import { saveTournamentResults } from "@/lib/results/store";
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

    /**
     * Starts the clock again where it was stopped. The level is backdated by the part of
     * it already played, so the remaining time carries over untouched.
     */
    const resumeFromPause = async () => {
      const duration = getLevelDuration(blindLevels[timerState.currentLevelIndex] ?? null);
      const remaining = timerState.pausedRemainingSeconds ?? duration;
      const startedAt = new Date(now.getTime() - (duration - remaining) * 1000);

      await auth.supabase.from("timer_state").update({
        status: "running",
        level_started_at: startedAt.toISOString(),
        paused_remaining_seconds: null,
      }).eq("tournament_id", t.id);
    };

    /**
     * Takes the announcement off the screens. Called from every action that sets the
     * clock going again: whatever gets the room playing ends the reseating, so the hall
     * is never told to move while the blinds run.
     */
    const clearTableMergeIfSet = async () => {
      const context = await loadCurrentTournamentContext(auth.supabase);
      if (!context?.extras.tableMerge) return;

      await saveTournamentExtrasFromContext(auth.supabase, context, { tableMerge: null });
    };

    if (action === "start") {
      if (timerState.status === "paused") {
        await resumeFromPause();
        await clearTableMergeIfSet();
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
            {
              settings: { sheetsSessionStartedAt: now.toISOString(), statsCountedAt: null },
              tableMerge: null,
            },
          );
        }
      }
    } else if (action === "pause" || action === "table-merge") {
      const { remainingSeconds, currentLevelIndex } = getEffectiveTimerState(timerState, blindLevels, now);
      await auth.supabase.from("timer_state").update({
        status: "paused",
        current_level_index: currentLevelIndex,
        paused_remaining_seconds: remainingSeconds,
      }).eq("tournament_id", t.id);

      // Breaking a table up takes as long as it takes: the clock waits for the room.
      if (action === "table-merge") {
        const context = await loadCurrentTournamentContext(auth.supabase);
        if (context) {
          await saveTournamentExtrasFromContext(
            auth.supabase,
            context,
            { tableMerge: { startedAt: now.toISOString() } },
          );
        }
      }
    } else if (action === "table-merge-end") {
      await clearTableMergeIfSet();

      // Only pick the clock back up if this pause is still the one the merge called.
      // Somebody may have started it again from the control screen in the meantime.
      if (timerState.status === "paused") await resumeFromPause();
    } else if (action === "next") {
      const { currentLevelIndex } = getEffectiveTimerState(timerState, blindLevels, now);
      const nextIndex = Math.min(currentLevelIndex + 1, Math.max(0, blindLevels.length - 1));
      await auth.supabase.from("timer_state").update({
        status: "running",
        current_level_index: nextIndex,
        level_started_at: now.toISOString(),
        paused_remaining_seconds: null,
      }).eq("tournament_id", t.id);
      await clearTableMergeIfSet();
    } else if (action === "previous") {
      const { currentLevelIndex } = getEffectiveTimerState(timerState, blindLevels, now);
      const previousIndex = Math.max(0, currentLevelIndex - 1);
      await auth.supabase.from("timer_state").update({
        status: "running",
        current_level_index: previousIndex,
        level_started_at: now.toISOString(),
        paused_remaining_seconds: null,
      }).eq("tournament_id", t.id);
      await clearTableMergeIfSet();
    } else if (action === "finish") {
      await auth.supabase.from("timer_state").update({
        status: "finished",
        current_level_index: 0,
        finished_at: now.toISOString(),
        paused_remaining_seconds: null,
      }).eq("tournament_id", t.id);

      // Count achievement stats from the final standings BEFORE the finish patch
      // wipes the roster (getFinishTournamentExtrasPatch resets players to []).
      const { error: statsError } = await auth.supabase.rpc("accumulate_client_bot_stats", {
        p_tournament_id: t.id,
      });
      if (statsError) {
        console.error("Failed to accumulate client bot stats", statsError);
      }

      const context = await loadCurrentTournamentContext(auth.supabase);
      if (context) {
        try {
          await saveTournamentResults({
            extras: context.extras,
            players: context.extras.players,
            supabase: auth.supabase,
            tournamentId: t.id,
          });
        } catch (resultsError) {
          console.error("Failed to store tournament results", resultsError);
        }

        // The roster goes, but the desk keeps a copy of it: the room settles up after the
        // finish, and without the copy nobody could be found to take the money from.
        await saveTournamentExtrasFromContext(
          auth.supabase,
          context,
          getFinishTournamentExtrasPatch(context.extras.players),
        );
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
