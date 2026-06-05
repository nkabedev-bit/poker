import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { parseTournamentImportPayload } from "@/lib/admin/import-export";
import {
  saveDemoBlindLevels,
  saveDemoExtras,
  saveDemoTimerState,
  saveDemoTournamentSettings,
} from "@/lib/demo-overrides";
import { hasPublicEnv } from "@/lib/env";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveTournamentExtras } from "@/lib/tournament-extras";

export async function POST(request: Request) {
  const parsed = parseTournamentImportPayload(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import file" }, { status: 400 });
  }

  if (!hasPublicEnv()) {
    const timerState = parsed.data.timerState;

    await saveDemoTournamentSettings({
      logoUrl: parsed.data.tournament.logoUrl ?? null,
      name: parsed.data.tournament.name,
      registrationMinutes: parsed.data.tournament.registrationMinutes,
      registrationStatus: parsed.data.tournament.registrationStatus ?? "open",
      startingStack: parsed.data.tournament.startingStack,
    });
    await saveDemoBlindLevels(parsed.data.blindLevels);
    if (timerState) {
      await saveDemoTimerState({
        status: timerState.status ?? "not_started",
        currentLevelIndex: timerState.currentLevelIndex ?? 0,
        levelStartedAt: timerState.levelStartedAt ?? null,
        pausedRemainingSeconds: timerState.pausedRemainingSeconds ?? null,
        registrationClosesAt: timerState.registrationClosesAt ?? null,
        finishedAt: timerState.finishedAt ?? null,
      });
    }
    await saveDemoExtras(parsed.data.extrasPatch);
    return NextResponse.json({ ok: true, demo: true });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  await supabase
    .from("tournaments")
    .update({
      name: parsed.data.tournament.name,
      logo_url: parsed.data.tournament.logoUrl ?? null,
      starting_stack: parsed.data.tournament.startingStack,
      registration_minutes: parsed.data.tournament.registrationMinutes,
      registration_status: parsed.data.tournament.registrationStatus ?? "open",
    })
    .eq("id", tournament.id);

  await supabase.from("blind_levels").delete().eq("tournament_id", tournament.id);
  await supabase.from("blind_levels").insert(
    parsed.data.blindLevels.map((level) => ({
      tournament_id: tournament.id,
      level_order: level.levelOrder,
      small_blind: level.isBreak ? null : level.smallBlind,
      big_blind: level.isBreak ? null : level.bigBlind,
      ante: level.isBreak ? null : level.ante,
      reentry_closes: level.isBreak ? false : level.reentryCloses,
      double_reentry_available: Boolean(level.doubleReentryAvailable),
      duration_seconds: level.durationSeconds,
      is_break: level.isBreak,
      break_duration_seconds: level.isBreak ? level.breakDurationSeconds : null,
    })),
  );

  const timerState = parsed.data.timerState;
  await supabase
    .from("timer_state")
    .update({
      status: timerState?.status ?? "not_started",
      current_level_index: timerState?.currentLevelIndex ?? 0,
      level_started_at: timerState?.levelStartedAt ?? null,
      paused_remaining_seconds: timerState?.pausedRemainingSeconds ?? null,
      registration_closes_at: timerState?.registrationClosesAt ?? null,
      finished_at: timerState?.finishedAt ?? null,
    })
    .eq("tournament_id", tournament.id);

  await saveTournamentExtras(parsed.data.extrasPatch, "/admin/settings");
  await broadcastPublicState(tournament.public_token as string);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/blinds");
  revalidatePath("/admin/timer");

  return NextResponse.json({ ok: true });
}
