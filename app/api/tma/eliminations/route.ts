import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { appendEliminationRow } from "@/lib/google-sheets";
import { buildPtsStandingsRows, recordPtsElimination } from "@/lib/pts-rating";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import { getEffectiveTimerState, isReentryAvailable } from "@/lib/timer/calculate";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

type Killer = {
  id: string;
  name: string;
  share: number;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  try {
    const { data: t } = await auth.supabase.from("tournaments").select("id, public_token").limit(1).single();
    if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

    const body = await request.json();
    const { eliminated_id, bounty_split, killers, uses_reentry } = body;

    const extras = await loadTournamentExtras(t.id);
    const eliminatedPlayer = extras.players.find(p => p.id === eliminated_id);
    if (!eliminatedPlayer) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    const isBounty = extras.settings.isBounty;
    const sanitizedKillers: Killer[] = isBounty && Array.isArray(killers)
      ? killers
        .map((killer: Partial<Killer>) => ({
          id: String(killer.id ?? ""),
          name: String(killer.name ?? ""),
          share: Number(killer.share ?? 0),
        }))
        .filter((killer) => killer.id && killer.share > 0)
      : [];
    const { data: stateData } = await auth.supabase.from("timer_state").select("*").eq("tournament_id", t.id).single();
    const { data: levelsData } = await auth.supabase.from("blind_levels").select("*").eq("tournament_id", t.id).order("level_order");

    const timerState: TimerState = {
      status: stateData?.status ?? "not_started",
      currentLevelIndex: stateData?.current_level_index ?? 0,
      levelStartedAt: stateData?.level_started_at ?? null,
      pausedRemainingSeconds: stateData?.paused_remaining_seconds ?? null,
      registrationClosesAt: stateData?.registration_closes_at ?? null,
      finishedAt: stateData?.finished_at ?? null,
    };
    const blindLevels: BlindLevel[] = (levelsData ?? []).map(row => ({
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
    const playerReentries = Math.max(0, Number(eliminatedPlayer.rebuys ?? 0));
    const maxReentries = Math.max(1, Number(extras.settings.maxReentries ?? 1));
    const usesReentry =
      Boolean(uses_reentry) &&
      extras.settings.reentryEnabled &&
      playerReentries < maxReentries &&
      isReentryAvailable(timerState, blindLevels, now);

    const eliminationResult = recordPtsElimination({
      eliminatedId: eliminated_id,
      isBounty,
      killers: sanitizedKillers,
      players: extras.players,
      usesReentry,
    });
    await saveTournamentExtras(
      eliminationResult.tournamentFinished
        ? getFinishTournamentExtrasPatch()
        : { players: eliminationResult.players },
      "/tma/eliminations",
    );

    if (eliminationResult.tournamentFinished) {
      await auth.supabase.from("timer_state").update({
        status: "finished",
        finished_at: new Date().toISOString(),
        paused_remaining_seconds: null,
      }).eq("tournament_id", t.id);
      await broadcastPublicState(t.public_token);
    }

    // Insert to bounty_log
    const { data: bountyRecord, error } = await auth.supabase.from("bounty_log").insert({
      tournament_id: t.id,
      eliminated_id,
      eliminated_name: eliminatedPlayer.name,
      finish_place: eliminationResult.finishPlace,
      bounty_split: isBounty ? bounty_split || false : false,
      killers: sanitizedKillers,
      recorded_by: auth.userId,
    }).select().single();

    if (error) throw error;

    let currentRound = 1;
    if (blindLevels.length > 0) {
      const eff = getEffectiveTimerState(timerState, blindLevels, now);
      currentRound = blindLevels[eff.currentLevelIndex]?.levelOrder || 1;
    }

    // Append to Sheets
    const { rowId, sheetName } = await appendEliminationRow({
      eliminatedName: eliminatedPlayer.name,
      finishPlace: eliminationResult.finishPlace,
      killers: sanitizedKillers,
      currentRound,
      standingsRows: buildPtsStandingsRows(eliminationResult.players, extras.pts),
      usesReentry,
    });

    return NextResponse.json({ elimination: bountyRecord, sheetsRowId: rowId, sheetName });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
