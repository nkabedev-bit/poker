import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";

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
  const extras = await loadTournamentExtras(t.id);
  const filtered = extras.players.filter((p) => p.id !== id);

  await saveTournamentExtras({ players: filtered }, "/tma/players");

  return new NextResponse(null, { status: 204 });
}
