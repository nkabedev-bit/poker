import { NextResponse } from "next/server";
import { demoPublicState } from "@/lib/demo-state";
import { hasPublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  if (!hasPublicEnv()) {
    return exportJson({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      ...demoPublicState,
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, logo_url, starting_stack, registration_minutes, registration_status, public_token")
    .limit(1)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const { data: timerState } = await supabase
    .from("timer_state")
    .select("status, current_level_index, level_started_at, paused_remaining_seconds, registration_closes_at, finished_at")
    .eq("tournament_id", tournament.id)
    .single();

  const { data: blindLevels } = await supabase
    .from("blind_levels")
    .select("id, level_order, small_blind, big_blind, ante, reentry_closes, duration_seconds, is_break, break_duration_seconds")
    .eq("tournament_id", tournament.id)
    .order("level_order", { ascending: true });

  return exportJson({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    tournament: {
      id: tournament.id,
      name: tournament.name,
      logoUrl: tournament.logo_url,
      startingStack: tournament.starting_stack,
      registrationMinutes: tournament.registration_minutes,
      registrationStatus: tournament.registration_status,
      publicToken: tournament.public_token,
    },
    timerState: {
      status: timerState?.status ?? "not_started",
      currentLevelIndex: timerState?.current_level_index ?? 0,
      levelStartedAt: timerState?.level_started_at ?? null,
      pausedRemainingSeconds: timerState?.paused_remaining_seconds ?? null,
      registrationClosesAt: timerState?.registration_closes_at ?? null,
      finishedAt: timerState?.finished_at ?? null,
    },
    blindLevels: (blindLevels ?? []).map((level) => ({
      id: level.id,
      levelOrder: level.level_order,
      smallBlind: level.small_blind,
      bigBlind: level.big_blind,
      ante: level.ante,
      reentryCloses: Boolean(level.reentry_closes),
      durationSeconds: level.duration_seconds,
      isBreak: level.is_break,
      breakDurationSeconds: level.break_duration_seconds,
    })),
  });
}

function exportJson(payload: unknown) {
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Disposition": "attachment; filename=\"poker-tournament.json\"",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
