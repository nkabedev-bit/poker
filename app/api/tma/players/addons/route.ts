import { after, NextResponse } from "next/server";
import { syncTournamentToSheets } from "@/lib/google-sheets";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import type { TournamentPlayer } from "@/lib/timer/types";

// Bulk addon: the admin ticks players off in a list instead of opening every profile.
// The chip amount matches the single-player flow in the TMA — fixed, never typed in.
export const BULK_ADDON_CHIPS = 6000;
// A tournament never seats more than a few dozen players; the cap only stops an
// absurd payload from turning into hundreds of RPC calls.
const MAX_BULK_PLAYERS = 100;

export type BulkAddonFailureReason = "not_found" | "eliminated" | "limit" | "error";

function parsePlayerIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const ids = Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  );

  if (ids.length === 0 || ids.length > MAX_BULK_PLAYERS) return null;
  return ids;
}

export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const playerIds = parsePlayerIds((body as { playerIds?: unknown } | null)?.playerIds);
  if (!playerIds) {
    return NextResponse.json({ error: "playerIds must be a non-empty array" }, { status: 400 });
  }

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  if (!extras.settings.addonEnabled) {
    return NextResponse.json({ error: "Addons disabled" }, { status: 400 });
  }

  const maxAddons = Math.max(1, Number(extras.settings.maxAddons ?? 1));
  const applied: Array<{ id: string; name: string }> = [];
  const failed: Array<{ id: string; name: string; reason: BulkAddonFailureReason }> = [];

  // Sequential on purpose: every addon mutates the same tournament_extras row, so
  // parallel writes would race each other and lose chips.
  for (const id of playerIds) {
    const player = extras.players.find((item) => item.id === id);

    if (!player) {
      failed.push({ id, name: "", reason: "not_found" });
      continue;
    }
    if (player.status !== "active") {
      failed.push({ id, name: player.name, reason: "eliminated" });
      continue;
    }
    if (Math.max(0, Number(player.addons ?? 0)) >= maxAddons) {
      failed.push({ id, name: player.name, reason: "limit" });
      continue;
    }

    const { data: updatedPlayer, error: rpcError } = await auth.supabase.rpc(
      "add_tournament_player_addon",
      { p_tournament_id: t.id, p_player_id: id, p_chips: BULK_ADDON_CHIPS },
    );

    if (rpcError) {
      console.error("Bulk addon failed for player", id, rpcError);
      failed.push({ id, name: player.name, reason: "error" });
      continue;
    }
    if (!updatedPlayer) {
      failed.push({ id, name: player.name, reason: "limit" });
      continue;
    }

    applied.push({ id, name: (updatedPlayer as TournamentPlayer).name || player.name });
  }

  if (applied.length > 0) {
    // One sync for the whole batch instead of one per player — the sheets write
    // quota is 60/min per service account.
    after(async () => {
      try {
        await syncTournamentToSheets(auth.supabase, t.id);
      } catch (sheetError) {
        console.error("Non-critical bulk addon sheets sync error:", sheetError);
      }
    });
  }

  return NextResponse.json({ applied, failed });
}
