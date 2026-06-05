import { after, NextResponse } from "next/server";
import { removePlayerFromVipSheet, syncTournamentToSheets } from "@/lib/google-sheets";
import { isVipRegistrationNumber } from "@/lib/player-registration-number";
import { getTargetedEliminationRollbackPlayers, type EliminationRollbackLog } from "@/lib/tma/elimination-rollback";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import type { TournamentPlayer } from "@/lib/timer/types";

type BountyLog = EliminationRollbackLog & {
  id: string;
  sheets_row_id?: number | null;
  sheets_sheet_name?: string | null;
};

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
    const { data: updatedPlayers, error: rpcError } = await auth.supabase.rpc("cancel_player_elimination", {
      p_tournament_id: t.id,
      p_eliminated_id: id,
      p_finish_place: typedLog.finish_place,
      p_killers: typedLog.killers,
      p_mystery_points: typedLog.mystery_bounty_points ?? 0,
      p_uses_reentry: typedLog.uses_reentry ?? false,
      p_players_before: null,
    });

    if (rpcError) throw rpcError;

    const playersList = updatedPlayers as TournamentPlayer[];
    const updatedPlayer = playersList.find((item) => item.id === id) ?? null;

    const { error: deleteError } = await auth.supabase
      .from("bounty_log")
      .delete()
      .eq("id", typedLog.id)
      .eq("tournament_id", t.id);

    if (deleteError) throw deleteError;

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

  return NextResponse.json({ player: updatedPlayer });
}
