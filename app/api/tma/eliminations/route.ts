import { after, NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { insertBountyLogRecord } from "@/lib/tma/bounty-log";
import { syncTournamentToSheets } from "@/lib/google-sheets";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import { getBountyChipAward, getDealerKnockoutChipAward, getEffectiveTimerState, getWantedBountyChipAward } from "@/lib/timer/calculate";
import { getPersistedPlayerLabel, isDealerLabel } from "@/lib/player-labels";
import { DEALER_KNOCKOUT_POINTS, getProgressiveHeadPoints, WANTED_KNOCKOUT_POINTS } from "@/lib/pts-rating";
import { resolveReentryEligibility } from "@/lib/tma/reentry-eligibility";
import { loadTimerContext } from "@/lib/tma/timer-context";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";
import type { TournamentPlayer } from "@/lib/timer/types";

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
    // Wanted Bounty: a player who already used at least one re-entry carries a bounty on
    // their head for the rest of the tournament; knocking them out pays fixed side points
    // plus a 3-big-blind stack reward. A regular (first-bullet) knockout pays the admin-
    // configured "bounty points" plus a 2-big-blind stack reward.
    const isWantedBounty = extras.settings.bountyType === "wanted";
    const eliminatedIsWanted = Math.max(0, Number(eliminatedPlayer.rebuys ?? 0)) > 0;
    const regularKnockoutPoints = Math.max(0, Number(extras.pts.bountyPoints) || 0);
    // Progressive Bounty: the victim's head is worth the base price plus a step for
    // every knockout they scored on this bullet — computed server-side from the stored
    // cycle counter, never from the client.
    const isProgressiveBounty = extras.settings.bountyType === "progressive";
    const mysteryBountyPoints = isDealerRevenge
      ? (eliminatedIsDealer ? DEALER_KNOCKOUT_POINTS : 0)
      : isWantedBounty
        ? (eliminatedIsWanted ? WANTED_KNOCKOUT_POINTS : regularKnockoutPoints)
        : isProgressiveBounty
          ? getProgressiveHeadPoints(eliminatedPlayer.progressiveKnockouts)
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
    const { blindLevels, timerState } = await loadTimerContext(auth.supabase, t.id);
    const now = new Date();
    const { reentryDouble, usesReentry } = resolveReentryEligibility({
      blindLevels,
      now,
      player: eliminatedPlayer,
      requestedDouble: Boolean(reentry_double),
      requestedReentry: Boolean(uses_reentry),
      settings: extras.settings,
      timerState,
    });
    const currentTimerState = getEffectiveTimerState(timerState, blindLevels, now);
    // The big-blind stack reward for a knockout applies in STANDARD bounty (with the
    // usual 2x-before-break / 1x-after formula), in Wanted Bounty for every knockout
    // (3 big blinds for a wanted victim, 2 for a regular one, on top of the side points)
    // and in Dealer Revenge for knocking out the dealer (3 big blinds on top of the side
    // points). In Mystery — and for non-dealer victims in Dealer Revenge — the knockout
    // reward is the side points only, so the killer's stack is left untouched.
    const bountyChipAward =
      isBounty && sanitizedKillers.length > 0
        ? extras.settings.bountyType === "standard"
          ? getBountyChipAward(blindLevels, currentTimerState.currentLevelIndex)
          : isWantedBounty
            ? getWantedBountyChipAward(blindLevels, currentTimerState.currentLevelIndex, eliminatedIsWanted)
            : isDealerRevenge && eliminatedIsDealer
              ? getDealerKnockoutChipAward(blindLevels, currentTimerState.currentLevelIndex)
              : 0
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
      p_progressive: isProgressiveBounty,
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
