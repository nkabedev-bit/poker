import { after, NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { syncTournamentToSheets } from "@/lib/google-sheets";
import { getTargetedEliminationRollbackPlayers } from "@/lib/tma/elimination-rollback";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import type { TournamentPlayer } from "@/lib/timer/types";

type BountyLog = {
  eliminated_id: string;
  finish_place: number | null;
  id: string;
  killers: unknown;
  players_before?: unknown;
  eliminated_name?: string | null;
  uses_reentry?: boolean | null;
  reentry_double?: boolean | null;
  mystery_bounty_points?: number | null;
  sheets_row_id?: number | null;
  sheets_sheet_name?: string | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isTournamentPlayers(value: unknown): value is TournamentPlayer[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const player = item as Partial<TournamentPlayer>;
    return typeof player.id === "string" && typeof player.name === "string";
  });
}

function getFallbackRollbackPlayers(log: BountyLog, players: TournamentPlayer[]) {
  return getTargetedEliminationRollbackPlayers(log, players);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const id = (await params).id;

  try {
    const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
    if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

    const { data: log, error } = await auth.supabase
      .from("bounty_log")
      .select("*")
      .eq("id", id)
      .eq("tournament_id", t.id)
      .single();

    if (error) throw error;

    const typedLog = log as BountyLog;

    const { data: updatedPlayersResult, error: rpcError } = await auth.supabase.rpc("cancel_player_elimination", {
      p_tournament_id: t.id,
      p_eliminated_id: typedLog.eliminated_id,
      p_finish_place: typedLog.finish_place,
      p_killers: typedLog.killers,
      p_mystery_points: typedLog.mystery_bounty_points ?? 0,
      p_uses_reentry: typedLog.uses_reentry ?? false,
      p_players_before: null,
      p_reentry_double: typedLog.reentry_double ?? false,
    });

    if (rpcError) throw rpcError;

    const updatedPlayers = updatedPlayersResult as TournamentPlayer[];

    const { error: deleteError } = await auth.supabase
      .from("bounty_log")
      .delete()
      .eq("id", id)
      .eq("tournament_id", t.id);

    if (deleteError) throw deleteError;

    after(async () => {
      try {
        await syncTournamentToSheets(auth.supabase, t.id);
      } catch (sheetError) {
        console.error("Non-critical cancel sheets sync error:", sheetError);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Cancel elimination outer catch error:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
