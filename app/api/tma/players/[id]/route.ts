import { after, NextResponse } from "next/server";
import { removePlayerFromVipSheet, syncTournamentToSheets } from "@/lib/google-sheets";
import { isVipRegistrationNumber } from "@/lib/player-registration-number";
import { insertBountyLogRecord } from "@/lib/tma/bounty-log";
import { getProgressiveKnockoutsBefore, type EliminationRollbackLog } from "@/lib/tma/elimination-rollback";
import { resolveReentryEligibility } from "@/lib/tma/reentry-eligibility";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTimerContext } from "@/lib/tma/timer-context";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import type { TournamentPlayer } from "@/lib/timer/types";

type BountyLog = EliminationRollbackLog & {
  bounty_split?: boolean | null;
  eliminated_name?: string | null;
  id: string;
  sheets_row_id?: number | null;
  sheets_sheet_name?: string | null;
};

// How the admin explains an eliminated player coming back: a mistaken knockout is
// erased outright, while a re-entry keeps the knockout on record (bounty stays paid)
// and credits the player with a re-entry — that is what the bot and the sheet read.
const RESTORE_REENTRY_MODES = ["none", "single", "double"] as const;
type RestoreReentryMode = (typeof RESTORE_REENTRY_MODES)[number];

function getRestoreReentryMode(value: unknown): RestoreReentryMode | null {
  if (value === undefined || value === null) return "none";
  return RESTORE_REENTRY_MODES.includes(value as RestoreReentryMode)
    ? (value as RestoreReentryMode)
    : null;
}

// The killers keep the bounty chips they were paid for this knockout, so re-recording
// it as a re-entry must hand out exactly the same award: shares sum to 1, which makes
// the total award the sum of the per-killer chips already stored in the log.
function getLoggedBountyChipAward(killers: unknown) {
  if (!Array.isArray(killers)) return 0;

  return killers.reduce((total: number, killer) => {
    const chips = Number((killer as { bountyChips?: unknown })?.bountyChips ?? 0);
    return Number.isFinite(chips) && chips > 0 ? total + chips : total;
  }, 0);
}

function getAddonChips(value: unknown) {
  const chips = Number(value);
  return Number.isInteger(chips) && chips > 0 ? chips : null;
}

function getTableNumber(value: unknown) {
  const tableNumber = Number(value);
  return Number.isInteger(tableNumber) && tableNumber > 0 ? tableNumber : null;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const id = (await params).id;

  // Capture the player before deletion so we can clean up an erroneous VIP entry.
  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const deletedPlayer = extras.players.find((player) => player.id === id);

  const { error: rpcError } = await auth.supabase.rpc("delete_tournament_player", {
    p_tournament_id: t.id,
    p_player_id: id,
  });

  if (rpcError) throw rpcError;

  if (deletedPlayer && isVipRegistrationNumber(deletedPlayer.registrationNumber)) {
    try {
      await removePlayerFromVipSheet(auth.supabase, t.id, deletedPlayer.name);
    } catch (sheetError) {
      console.error("Failed to remove player from VIP sheet", sheetError);
    }
  }

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json();
  const action = String(body.action ?? "");

  const id = (await params).id;
  const extras = await loadTournamentExtras(t.id, auth.supabase);

  if (action === "restore_player") {
    const player = extras.players.find((item) => item.id === id);
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    if (player.status !== "eliminated") {
      return NextResponse.json({ error: "Player is not eliminated" }, { status: 409 });
    }

    const reentryMode = getRestoreReentryMode(body.reentry);
    if (!reentryMode) {
      return NextResponse.json({ error: "Unknown reentry mode" }, { status: 400 });
    }

    // Refuse an impossible re-entry before anything is rolled back, so a rejected
    // request leaves the player eliminated instead of half-restored.
    let reentryDouble = false;
    if (reentryMode !== "none") {
      const { blindLevels, timerState } = await loadTimerContext(auth.supabase, t.id);
      const eligibility = resolveReentryEligibility({
        blindLevels,
        now: new Date(),
        player,
        requestedDouble: reentryMode === "double",
        requestedReentry: true,
        settings: extras.settings,
        timerState,
      });

      if (!eligibility.usesReentry) {
        const reentryLimitReached =
          extras.settings.bountyType !== "wanted" &&
          extras.settings.bountyType !== "progressive" &&
          Math.max(0, Number(player.rebuys ?? 0)) >= Math.max(1, Number(extras.settings.maxReentries ?? 1));

        return NextResponse.json(
          {
            error: !extras.settings.reentryEnabled
              ? "Ре-энтри отключён в настройках турнира"
              : reentryLimitReached
                ? "Игрок уже использовал все ре-энтри"
                : "Окно ре-энтри уже закрыто",
          },
          { status: 409 },
        );
      }
      if (reentryMode === "double" && !eligibility.reentryDouble) {
        return NextResponse.json(
          { error: "Двойной ре-энтри недоступен на текущем уровне" },
          { status: 409 },
        );
      }

      reentryDouble = eligibility.reentryDouble;
    }

    const { data: log, error: logError } = await auth.supabase
      .from("bounty_log")
      .select("*")
      .eq("tournament_id", t.id)
      .eq("eliminated_id", id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logError) throw logError;
    if (!log) {
      return NextResponse.json({ error: "Elimination not found" }, { status: 404 });
    }

    const typedLog = log as BountyLog;
    const isProgressiveBounty = extras.settings.bountyType === "progressive";
    const { data: updatedPlayers, error: rpcError } = await auth.supabase.rpc("cancel_player_elimination", {
      p_tournament_id: t.id,
      p_eliminated_id: id,
      p_finish_place: typedLog.finish_place,
      p_killers: typedLog.killers,
      p_mystery_points: typedLog.mystery_bounty_points ?? 0,
      p_uses_reentry: typedLog.uses_reentry ?? false,
      p_players_before: null,
      p_reentry_double: typedLog.reentry_double ?? false,
      p_progressive: isProgressiveBounty,
      p_victim_progressive: getProgressiveKnockoutsBefore(typedLog),
    });

    if (rpcError) throw rpcError;

    const playersList = updatedPlayers as TournamentPlayer[];
    let updatedPlayer = playersList.find((item) => item.id === id) ?? null;

    const { error: deleteError } = await auth.supabase
      .from("bounty_log")
      .delete()
      .eq("id", typedLog.id)
      .eq("tournament_id", t.id);

    if (deleteError) throw deleteError;

    if (reentryMode !== "none") {
      // The knockout itself stands — it is re-recorded as a re-entry, keeping the
      // killers' bounty and mystery points untouched while the player comes back with
      // rebuys (and doubleRebuys for an x2) incremented.
      try {
        const bountyChipAward = getLoggedBountyChipAward(typedLog.killers);
        const mysteryPoints = Number(typedLog.mystery_bounty_points ?? 0) || 0;

        const { data: rpcResult, error: recordError } = await auth.supabase.rpc(
          "record_player_elimination",
          {
            p_tournament_id: t.id,
            p_eliminated_id: id,
            p_killers: typedLog.killers ?? [],
            p_bounty_chip_award: bountyChipAward,
            p_mystery_points: mysteryPoints,
            p_uses_reentry: true,
            p_is_bounty: extras.settings.isBounty,
            p_reentry_double: reentryDouble,
            p_progressive: isProgressiveBounty,
          },
        );

        if (recordError) throw recordError;

        const { players: playersAfterReentry } = rpcResult as { players: TournamentPlayer[] };
        updatedPlayer = playersAfterReentry.find((item) => item.id === id) ?? updatedPlayer;

        await insertBountyLogRecord(auth.supabase, {
          tournament_id: t.id,
          eliminated_id: id,
          eliminated_name: typedLog.eliminated_name ?? player.name,
          finish_place: null,
          bounty_split: Boolean(typedLog.bounty_split),
          client_request_id: null,
          killers: typedLog.killers ?? [],
          mystery_bounty_points: mysteryPoints,
          players_after: playersAfterReentry,
          players_before: playersList,
          recorded_by: auth.userId,
          uses_reentry: true,
          reentry_double: reentryDouble,
        });
      } catch (reentryError) {
        console.error("Failed to record re-entry on player restore:", reentryError);
        return NextResponse.json(
          {
            error: "Игрок возвращён в игру, но ре-энтри НЕ записан. Отметьте его вручную.",
            player: updatedPlayer,
          },
          { status: 500 },
        );
      }
    }

    after(async () => {
      try {
        await syncTournamentToSheets(auth.supabase, t.id);
      } catch (sheetError) {
        console.error("Non-critical player restore sheets sync error:", sheetError);
      }
    });

    return NextResponse.json({ player: updatedPlayer });
  }

  if (action === "move_table") {
    const tableNumber = getTableNumber(body.table);
    const tablesCount = Math.max(1, Number(extras.settings.tablesCount ?? 1));
    if (!tableNumber || tableNumber > tablesCount) {
      return NextResponse.json({ error: "Invalid table number" }, { status: 400 });
    }

    const { data: updatedPlayer, error: rpcError } = await auth.supabase.rpc("move_tournament_player", {
      p_tournament_id: t.id,
      p_player_id: id,
      p_table: tableNumber,
    });

    if (rpcError) throw rpcError;

    if (!updatedPlayer) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json({ player: updatedPlayer });
  }

  if (action !== "add_addon") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const chips = getAddonChips(body.chips);
  if (!chips) {
    return NextResponse.json({ error: "Chips must be positive integer" }, { status: 400 });
  }

  if (!extras.settings.addonEnabled) {
    return NextResponse.json({ error: "Addons disabled" }, { status: 400 });
  }

  const { data: updatedPlayer, error: rpcError } = await auth.supabase.rpc("add_tournament_player_addon", {
    p_tournament_id: t.id,
    p_player_id: id,
    p_chips: chips,
  });

  if (rpcError) throw rpcError;

  if (!updatedPlayer) {
    const exists = extras.players.some((player) => player.id === id);
    return NextResponse.json(
      { error: exists ? "Addon limit reached" : "Player not found" },
      { status: exists ? 409 : 404 },
    );
  }

  // An addon changes both the sheet's addon column and the money owed, so the sheets are
  // refreshed here instead of waiting for the next elimination.
  after(async () => {
    try {
      await syncTournamentToSheets(auth.supabase, t.id);
    } catch (sheetError) {
      console.error("Non-critical addon sheets sync error:", sheetError);
    }
  });

  return NextResponse.json({ player: updatedPlayer });
}
