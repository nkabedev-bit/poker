import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { syncTournamentToSheets } from "@/lib/google-sheets";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import { getBountyChipAward, getEffectiveTimerState, isReentryAvailable } from "@/lib/timer/calculate";
import { getPersistedPlayerLabel, isDealerLabel } from "@/lib/player-labels";
import { DEALER_KNOCKOUT_POINTS } from "@/lib/pts-rating";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";
import type { BlindLevel, TimerState, TournamentPlayer } from "@/lib/timer/types";

type Killer = {
  id: string;
  name: string;
  share: number;
};

const SAME_PLAYER_DUPLICATE_WINDOW_SECONDS = 30;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isMissingBountyLogSnapshotColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "");
  return message.includes("players_before")
    || message.includes("players_after")
    || message.includes("uses_reentry")
    || message.includes("reentry_double")
    || message.includes("sheets_row_id")
    || message.includes("sheets_sheet_name")
    || message.includes("mystery_bounty_points");
}

async function insertBountyLogRecord(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase.from("bounty_log").insert(payload).select().single();
  if (!error) return data;

  if (!isMissingBountyLogSnapshotColumnError(error)) throw error;

  const legacyPayload = { ...payload };
  delete legacyPayload.players_after;
  delete legacyPayload.players_before;
  delete legacyPayload.uses_reentry;
  delete legacyPayload.reentry_double;
  delete legacyPayload.mystery_bounty_points;

  console.warn("bounty_log snapshot columns are unavailable; retrying legacy insert", error);
  const { data: legacyData, error: legacyError } = await supabase
    .from("bounty_log")
    .insert(legacyPayload)
    .select()
    .single();

  if (legacyError) throw legacyError;
  return legacyData;
}



export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  try {
    const { data: t } = await auth.supabase.from("tournaments").select("id, public_token").limit(1).single();
    if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

    const body = await request.json();
    const { eliminated_id, bounty_split, client_request_id, killers, mystery_bounty_points, uses_reentry, reentry_double } = body;
    const clientMysteryPoints = Number(mystery_bounty_points) || 0;
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
    // Dealer Revenge: knockout points are computed server-side — a fixed award for
    // knocking out a player carrying the dealer label, nothing for anyone else. The
    // client-entered value is only trusted in Mystery mode, where the admin types in
    // the drawn mystery prize. Both the live label and the persistent per-nickname
    // store are checked so a label given mid-game by the bot command still counts.
    const isDealerRevenge = extras.settings.bountyType === "dealer";
    const eliminatedIsDealer =
      isDealerLabel(eliminatedPlayer.label) ||
      isDealerLabel(getPersistedPlayerLabel(extras.playerLabels, eliminatedPlayer.name));
    const mysteryBountyPoints = isDealerRevenge
      ? (eliminatedIsDealer ? DEALER_KNOCKOUT_POINTS : 0)
      : extras.settings.bountyType === "mystery"
        ? clientMysteryPoints
        : 0;
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
      doubleReentryAvailable: Boolean(row.double_reentry_available),
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
    const reentryDouble =
      usesReentry &&
      Boolean(reentry_double) &&
      Boolean(blindLevels[currentTimerState.currentLevelIndex]?.doubleReentryAvailable);
    // The 2-big-blind stack reward for a knockout is a STANDARD-bounty-only mechanic.
    // In Mystery / Dealer Revenge the knockout reward is the side points instead, so the
    // killer's stack is left untouched there.
    const bountyChipAward =
      isBounty && extras.settings.bountyType === "standard" && sanitizedKillers.length > 0
        ? getBountyChipAward(blindLevels, currentTimerState.currentLevelIndex)
        : 0;
    const killersWithBountyChips = sanitizedKillers.map((killer) => ({
      ...killer,
      bountyChips: Number((killer.share * bountyChipAward).toFixed(6)),
    }));

    const { data: rpcResult, error: rpcError } = await auth.supabase.rpc("record_player_elimination", {
      p_tournament_id: t.id,
      p_eliminated_id: eliminated_id,
      p_killers: sanitizedKillers,
      p_bounty_chip_award: bountyChipAward,
      p_mystery_points: mysteryBountyPoints,
      p_uses_reentry: usesReentry,
      p_is_bounty: isBounty,
      p_reentry_double: reentryDouble,
    });

    if (rpcError) throw rpcError;

    const { players: updatedPlayers, finishPlace, tournamentFinished } = rpcResult as {
      players: TournamentPlayer[];
      finishPlace: number | null;
      tournamentFinished: boolean;
    };

    if (tournamentFinished) {
      await auth.supabase.from("timer_state").update({
        status: "finished",
        current_level_index: 0,
        finished_at: new Date().toISOString(),
        paused_remaining_seconds: null,
      }).eq("tournament_id", t.id);
      // Count per-player achievement stats BEFORE clearing the roster: the finish
      // patch resets players to [], and accumulate_client_bot_stats reads the final
      // standings that record_player_elimination just persisted.
      const { error: statsError } = await auth.supabase.rpc("accumulate_client_bot_stats", {
        p_tournament_id: t.id,
      });
      if (statsError) {
        console.error("Failed to accumulate client bot stats", statsError);
      }
      await saveTournamentExtras(getFinishTournamentExtrasPatch(), "/admin/players", auth.supabase);
      await broadcastPublicState(t.public_token);
    }

    // Insert to bounty_log
    const bountyRecord = await insertBountyLogRecord(auth.supabase, {
      tournament_id: t.id,
      eliminated_id,
      eliminated_name: eliminatedPlayer.name,
      finish_place: finishPlace,
      bounty_split: isBounty ? bounty_split || false : false,
      client_request_id: clientRequestId || null,
      killers: killersWithBountyChips,
      mystery_bounty_points: mysteryBountyPoints,
      players_after: updatedPlayers,
      players_before: extras.players,
      recorded_by: auth.userId,
      uses_reentry: usesReentry,
      reentry_double: reentryDouble,
    });

    // Sync to Sheets asynchronously in the background
    after(async () => {
      try {
        await syncTournamentToSheets(auth.supabase, t.id);
      } catch (sheetError) {
        console.error("Non-critical Google Sheets sync error:", sheetError);
      }
    });

    return NextResponse.json({ elimination: bountyRecord });
  } catch (err: unknown) {
    console.error("Error in POST /api/tma/eliminations:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
