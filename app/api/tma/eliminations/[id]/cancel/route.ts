import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { markRowCancelled } from "@/lib/google-sheets";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const id = (await params).id;

  try {
    const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
    if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

    // Cancel in Supabase
    const { data: log, error } = await auth.supabase
      .from("bounty_log")
      .update({ cancelled: true, cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tournament_id", t.id)
      .select()
      .single();

    if (error) throw error;

    // Restore player status
    const extras = await loadTournamentExtras(t.id);
    const bountyEntries: Array<[string, number]> = [];
    for (const killer of Array.isArray(log.killers) ? log.killers : []) {
      const id = String((killer as { id?: unknown }).id ?? "");
      const share = Number((killer as { share?: unknown }).share ?? 0);
      if (id && share > 0) {
        bountyEntries.push([id, share]);
      }
    }
    const bountyByPlayerId = new Map<string, number>(bountyEntries);
    const updatedPlayers = extras.players.map((player) => {
      let restored =
        player.id === log.eliminated_id
          ? { ...player, finishPlace: null, status: "active" as const }
          : player;
      if (log.finish_place === 2 && restored.finishPlace === 1) {
        restored = { ...restored, finishPlace: null };
      }
      const bountyShare = bountyByPlayerId.get(player.id);
      if (!bountyShare) return restored;

      return {
        ...restored,
        bountyCount: Math.max(0, Number(((restored.bountyCount || 0) - bountyShare).toFixed(6))),
      };
    });
    await saveTournamentExtras({ players: updatedPlayers }, "/tma/eliminations");

    // Try cancel in Sheets if body contains row info
    try {
      const body = await request.json();
      if (body.sheetName && body.rowId) {
        await markRowCancelled(body.sheetName, body.rowId);
      }
    } catch {
      // Body parse error or missing fields, ignore sheets update
      console.log("No sheet info provided for cancellation");
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
