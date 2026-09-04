import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import { buildCardSession, normalizeCardCode } from "@/lib/cards/card-code";
import { getFinancePrices } from "@/lib/finance/player-charge";

export const dynamic = "force-dynamic";

/**
 * Marks what a player has handed over. Paying covers the bill as it stands right now,
 * so a re-entry bought afterwards shows up as owed again.
 */
export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const cardCode = normalizeCardCode(body.cardCode);
  const paid = Boolean(body.paid);

  if (!cardCode) return NextResponse.json({ error: "Пустой код карты" }, { status: 400 });

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const player = extras.players.find((item) => item.cardCode === cardCode);

  if (!player) return NextResponse.json({ error: "Карта ни за кем не закреплена" }, { status: 404 });

  const prices = getFinancePrices(extras.settings);
  const freeroll = extras.settings.tournamentFormat === "freeroll";
  const session = buildCardSession(player, cardCode, prices, { freeroll });

  const { data, error } = await auth.supabase.rpc("set_player_paid_amount", {
    p_tournament_id: t.id,
    p_player_id: player.id,
    p_paid_amount: paid ? session.charge.total : 0,
  });

  if (error) throw error;

  return NextResponse.json({ session: buildCardSession(data, cardCode, prices, { freeroll }) });
}
