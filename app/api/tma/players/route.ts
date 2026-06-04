import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import { isReentryAvailable } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const extras = await loadTournamentExtras(t.id);
  const { data: timerRow } = await auth.supabase
    .from("timer_state")
    .select("*")
    .eq("tournament_id", t.id)
    .single();
  const { data: levelRows } = await auth.supabase
    .from("blind_levels")
    .select("*")
    .eq("tournament_id", t.id)
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
    durationSeconds: row.duration_seconds,
    isBreak: row.is_break,
    breakDurationSeconds: row.break_duration_seconds,
  }));

  return NextResponse.json({
    isBounty: extras.settings.isBounty,
    addonEnabled: extras.settings.addonEnabled,
    maxAddons: extras.settings.maxAddons,
    maxReentries: extras.settings.maxReentries,
    players: extras.players || [],
    tablesCount: extras.settings.tablesCount,
    reentryAvailable: extras.settings.reentryEnabled
      ? isReentryAvailable(timerState, blindLevels, new Date())
      : false,
    reentryEnabled: extras.settings.reentryEnabled,
  });
}

export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id, starting_stack")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json();
  const { name, table, seat } = body;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const extras = await loadTournamentExtras(t.id);
  const newPlayer = {
    id: crypto.randomUUID(),
    name,
    stack: Number(t.starting_stack) || 10000,
    table: Number(table) || 1,
    seat: Number(seat) || 1,
    status: "active" as const,
    rebuys: 0,
    addons: 0,
    addonChipsTotal: 0,
    bountyCount: 0,
    finishPlace: null,
  };

  await saveTournamentExtras(
    { players: [...extras.players, newPlayer] },
    "/tma/players"
  );

  return NextResponse.json({ player: newPlayer });
}
