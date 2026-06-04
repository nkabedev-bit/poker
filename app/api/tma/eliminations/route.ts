import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { appendEliminationRow } from "@/lib/google-sheets";
import { buildPtsStandingsRows, recordPtsElimination } from "@/lib/pts-rating";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import { getBountyChipAward, getEffectiveTimerState, isReentryAvailable } from "@/lib/timer/calculate";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

type Killer = {
  id: string;
  name: string;
  share: number;
};

const SAME_PLAYER_DUPLICATE_WINDOW_SECONDS = 30;

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
    const { eliminated_id, bounty_split, client_request_id, killers, uses_reentry } = body;
    const clientRequestId = typeof client_request_id === "string" ? client_request_id.trim() : "";

    if (clientRequestId) {
      const { data: existingElimination } = await auth.supabase
        .from("bounty_log")
        .select("*")
        .eq("tournament_id", t.id)
        .eq("client_request_id", clientRequestId)
        .maybeSingle();

      if (existingElimination) {
        return NextResponse.json({ duplicate: true, elimination: existingElimination });
      }
    }

    const duplicateCutoff = new Date(Date.now() - SAME_PLAYER_DUPLICATE_WINDOW_SECONDS * 1000).toISOString();
    const { data: recentElimination } = await auth.supabase
      .from("bounty_log")
      .select("*")
      .eq("tournament_id", t.id)
      .eq("eliminated_id", eliminated_id)
      .eq("cancelled", false)
      .gte("recorded_at", duplicateCutoff)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentElimination) {
      return NextResponse.json({ duplicate: true, elimination: recentElimination });
    }

    const extras = await loadTournamentExtras(t.id, auth.supabase);
    const eliminatedPlayer = extras.players.find(p => p.id === eliminated_id);
    if (!eliminatedPlayer) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    if (eliminatedPlayer.status !== "active") {
      return NextResponse.json({ error: "Player already eliminated" }, { status: 409 });
    }

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
    const currentTimerState = getEffectiveTimerState(timerState, blindLevels, now);
    const bountyChipAward =
      isBounty && sanitizedKillers.length > 0
        ? getBountyChipAward(blindLevels, currentTimerState.currentLevelIndex)
        : 0;
    const killersWithBountyChips = sanitizedKillers.map((killer) => ({
      ...killer,
      bountyChips: Number((killer.share * bountyChipAward).toFixed(6)),
    }));

    const eliminationResult = recordPtsElimination({
      bountyChipAward,
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
      auth.supabase,
    );

    if (eliminationResult.tournamentFinished) {
      await auth.supabase.from("timer_state").update({
        status: "finished",
        current_level_index: 0,
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
      client_request_id: clientRequestId || null,
      killers: killersWithBountyChips,
      recorded_by: auth.userId,
    }).select().single();

    if (error) throw error;

    let currentRound = 1;
    if (blindLevels.length > 0) {
      currentRound = blindLevels[currentTimerState.currentLevelIndex]?.levelOrder || 1;
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
