import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { insertBountyLogRecord } from "@/lib/tma/bounty-log";
import { appendFreeEntryGrant, syncTournamentToSheets } from "@/lib/google-sheets";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import { getBountyChipAward, getDealerKnockoutChipAward, getEffectiveTimerState, getWantedBountyChipAward, resolveEffectiveBigBlind } from "@/lib/timer/calculate";
import {
  describeMysteryPrize,
  getMysteryPrizeChips,
  getMysteryPrizePass,
  getMysteryPrizePoints,
  parseMysteryPrizes,
  type MysteryPrize,
} from "@/lib/mystery/prizes";
import { getPersistedPlayerLabel, isDealerLabel } from "@/lib/player-labels";
import { DEALER_KNOCKOUT_POINTS, getProgressiveHeadPoints, WANTED_KNOCKOUT_POINTS } from "@/lib/pts-rating";
import { resolveReentryEligibility } from "@/lib/tma/reentry-eligibility";
import { loadTimerContext } from "@/lib/tma/timer-context";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";
import { saveTournamentResults } from "@/lib/results/store";
import type { TournamentPlayer } from "@/lib/timer/types";

type Killer = {
  id: string;
  name: string;
  share: number;
};

/** A killer with what this knockout paid them — the shared award, or their own card. */
type KillerAward = Killer & {
  bountyChips: number;
  mysteryPoints: number;
  prize?: MysteryPrize;
  prizeLabel?: string;
};

const SAME_PLAYER_DUPLICATE_WINDOW_SECONDS = 30;

export type MysteryPassResult = {
  /** False when the player has no Telegram account to credit — the admin hands it over. */
  granted: boolean;
  nickname: string;
  vip: boolean;
};

/**
 * A Mystery card can pay a free entry.
 *
 * The prize is real either way, so it always reaches the "Проходки" ledger; the profile
 * counter only moves for a player whose nickname is linked to a Telegram account.
 */
async function grantMysteryBountyPass(
  supabase: SupabaseClient,
  killer: { id: string; name: string },
  players: TournamentPlayer[],
  vip: boolean,
): Promise<MysteryPassResult> {
  const seat = players.find((player) => player.id === killer.id);
  // The account behind the seat, whichever door its owner came through. A player the
  // admin added by hand has neither, and the pass is handed over at the table.
  const by = seat?.accountId
    ? { column: "id", value: seat.accountId as string | number }
    : seat?.telegramId
      ? { column: "telegram_id", value: seat.telegramId as string | number }
      : null;
  const column = vip ? "vip_free_entries" : "free_entries";
  let granted = false;

  if (by) {
    const { data: account } = await supabase
      .from("client_bot_users")
      .select(column)
      .eq(by.column, by.value)
      .maybeSingle();

    if (account) {
      const held = Math.max(0, Number((account as Record<string, number>)[column] ?? 0));
      const { error } = await supabase
        .from("client_bot_users")
        .update({ [column]: held + 1 })
        .eq(by.column, by.value);

      if (error) console.error("Failed to grant the mystery bounty pass", error);
      else granted = true;
    }
  }

  try {
    await appendFreeEntryGrant({ count: 1, nickname: killer.name, source: "mystery", vip });
  } catch (sheetError) {
    console.error("Failed to log the mystery bounty pass", sheetError);
  }

  return { granted, nickname: killer.name, vip };
}

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
    const { eliminated_id, bounty_split, client_request_id, killers, mystery_prizes, uses_reentry, reentry_double } = body;
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
    // Mystery Bounty: each killer draws their own card, so the award is per killer
    // instead of one number split by shares. Every other mode keeps the shared award,
    // written out per killer so the database never has to guess.
    const mysteryPrizeByKillerId = new Map(
      (extras.settings.bountyType === "mystery"
        ? parseMysteryPrizes(mystery_prizes, sanitizedKillers.map((killer) => killer.id))
        : []
      ).map((entry) => [entry.killerId, entry.prize]),
    );
    const mysteryBigBlind = resolveEffectiveBigBlind(blindLevels, currentTimerState.currentLevelIndex);
    const killersWithBountyChips: KillerAward[] = sanitizedKillers.map((killer) => {
      const prize = mysteryPrizeByKillerId.get(killer.id);

      return {
        ...killer,
        bountyChips: prize
          ? getMysteryPrizeChips(prize, mysteryBigBlind)
          : Number((killer.share * bountyChipAward).toFixed(6)),
        mysteryPoints: prize
          ? getMysteryPrizePoints(prize)
          : Number((killer.share * mysteryBountyPoints).toFixed(2)),
        ...(prize ? { prize, prizeLabel: describeMysteryPrize(prize) } : {}),
      };
    });
    // What the evening's knockout paid in points, for the log and for the rollback.
    const recordedMysteryPoints = mysteryPrizeByKillerId.size > 0
      ? Number(killersWithBountyChips.reduce((total, killer) => total + killer.mysteryPoints, 0).toFixed(2))
      : mysteryBountyPoints;

    const { data: rpcResult, error: rpcError } = await auth.supabase.rpc("record_player_elimination", {
      p_tournament_id: t.id,
      p_eliminated_id: eliminated_id,
      p_killers: killersWithBountyChips,
      p_bounty_chip_award: bountyChipAward,
      p_mystery_points: recordedMysteryPoints,
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

      // Same reason as the stats above: the finishing table has to be stored before the
      // roster is wiped, otherwise the evening leaves no history behind.
      try {
        await saveTournamentResults({
          extras,
          players: updatedPlayers,
          supabase: auth.supabase,
          tournamentId: t.id,
        });
      } catch (resultsError) {
        console.error("Failed to store tournament results", resultsError);
      }

      await saveTournamentExtras(getFinishTournamentExtrasPatch(), "/admin/players", auth.supabase);
      await broadcastPublicState(t.public_token);
    }

    // Migration 202609040005 taught the database to read each killer's own card. Until
    // it is applied the chips silently stay put, so the admin is told rather than left
    // to notice a stack that never grew.
    const prizeChipsMissing = killersWithBountyChips.some((killer) => {
      if (!killer.prize || killer.bountyChips <= 0) return false;

      const before = Number(extras.players.find((item) => item.id === killer.id)?.stack ?? 0);
      const after = Number(updatedPlayers.find((item) => item.id === killer.id)?.stack ?? 0);

      return Math.abs(after - (before + killer.bountyChips)) > 0.5;
    });

    // The passes are credited once the knockout itself is safely recorded.
    const mysteryPasses: MysteryPassResult[] = [];
    for (const killer of killersWithBountyChips) {
      const pass = killer.prize ? getMysteryPrizePass(killer.prize) : null;
      if (!pass) continue;

      mysteryPasses.push(
        await grantMysteryBountyPass(auth.supabase, killer, updatedPlayers, pass === "vip"),
      );
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
      mystery_bounty_points: recordedMysteryPoints,
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

    return NextResponse.json({
      elimination: bountyRecord,
      mysteryPasses,
      prizeWarning: prizeChipsMissing
        ? "Фишки за большой блайнд не начислились — миграция 202609040005 не применена"
        : null,
    });
  } catch (err: unknown) {
    console.error("Error in POST /api/tma/eliminations:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
