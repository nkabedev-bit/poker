import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { appendFreeEntryGrant, syncTournamentToSheets } from "@/lib/google-sheets";
import { getMysteryPrizePass, parseMysteryPrize } from "@/lib/mystery/prizes";
import { getProgressiveKnockoutsBefore, getTargetedEliminationRollbackPlayers } from "@/lib/tma/elimination-rollback";
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

/**
 * Takes back the free entries a Mystery card paid out.
 *
 * Only asked for when the knockout itself was a misclick: a player who is re-entering
 * keeps what they won, so the caller decides and this runs on request.
 */
async function revokeMysteryPasses(
  supabase: SupabaseClient,
  log: BountyLog,
  players: TournamentPlayer[],
) {
  for (const killer of Array.isArray(log.killers) ? log.killers : []) {
    const item = killer as { id?: unknown; name?: unknown; prize?: unknown };
    const prize = parseMysteryPrize(item.prize);
    const pass = prize ? getMysteryPrizePass(prize) : null;
    if (!pass) continue;

    const killerId = String(item.id ?? "");
    const nickname = String(item.name ?? "");
    const telegramId = players.find((player) => player.id === killerId)?.telegramId ?? null;
    const column = pass === "vip" ? "vip_free_entries" : "free_entries";

    if (telegramId) {
      const { data: account } = await supabase
        .from("client_bot_users")
        .select(column)
        .eq("telegram_id", telegramId)
        .maybeSingle();

      if (account) {
        const held = Math.max(0, Number((account as Record<string, number>)[column] ?? 0));
        const { error } = await supabase
          .from("client_bot_users")
          .update({ [column]: Math.max(0, held - 1) })
          .eq("telegram_id", telegramId);

        if (error) console.error("Failed to take the mystery bounty pass back", error);
      }
    }

    try {
      await appendFreeEntryGrant({
        count: -1,
        nickname,
        source: "mystery",
        vip: pass === "vip",
      });
    } catch (sheetError) {
      console.error("Failed to log the cancelled mystery bounty pass", sheetError);
    }
  }
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
    const extras = await loadTournamentExtras(t.id, auth.supabase);
    const isProgressiveBounty = extras.settings.bountyType === "progressive";
    const body = await request.json().catch(() => ({}));

    // A misclick takes the prize back; a knockout undone because the player is
    // re-entering leaves it with them.
    if (body?.revoke_passes === true) {
      await revokeMysteryPasses(auth.supabase, typedLog, extras.players);
    }

    const { data: updatedPlayersResult, error: rpcError } = await auth.supabase.rpc("cancel_player_elimination", {
      p_tournament_id: t.id,
      p_eliminated_id: typedLog.eliminated_id,
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
