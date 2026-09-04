import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import {
  buildCardSession,
  isTicketType,
  normalizeCardCode,
} from "@/lib/cards/card-code";
import { getFinancePrices } from "@/lib/finance/player-charge";

export const dynamic = "force-dynamic";

/** Reads the card: who holds it tonight and what they took. */
export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const prices = getFinancePrices(extras.settings);
  const freeroll = extras.settings.tournamentFormat === "freeroll";

  const cardCode = normalizeCardCode(new URL(request.url).searchParams.get("code"));

  // Without a code the screen is asking for the evening as a whole: every card that is
  // out, so the desk can see who still owes money.
  if (!cardCode) {
    return NextResponse.json({
      issued: extras.players
        .filter((item) => item.cardCode && item.status === "active")
        .map((item) => buildCardSession(item, String(item.cardCode), prices, { freeroll }))
        .sort((a, b) => (a.registrationNumber ?? 0) - (b.registrationNumber ?? 0)),
    });
  }

  const player = extras.players.find((item) => item.cardCode === cardCode);

  if (!player) {
    return NextResponse.json({ cardCode, session: null });
  }

  return NextResponse.json({
    cardCode,
    session: buildCardSession(player, cardCode, prices, { freeroll }),
  });
}

/** Hands a card to a player for the evening. */
export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const body = await request.json().catch(() => ({}));
  const cardCode = normalizeCardCode(body.cardCode);
  const playerId = String(body.playerId ?? "");
  const ticketType = isTicketType(body.ticketType) ? body.ticketType : "regular";

  if (!cardCode) return NextResponse.json({ error: "Пустой код карты" }, { status: 400 });
  if (!playerId) return NextResponse.json({ error: "Не выбран игрок" }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("assign_player_card", {
    p_tournament_id: t.id,
    p_player_id: playerId,
    p_card_code: cardCode,
    p_ticket_type: ticketType,
  });

  if (error) {
    // The database refuses a card that is already out with someone else; that is an
    // everyday mistake at the door, not a server fault.
    const message = String(error.message ?? "");
    if (message.includes("Card already issued")) {
      return NextResponse.json(
        { error: "Эта карта уже выдана другому игроку" },
        { status: 409 },
      );
    }
    if (message.includes("Player not found")) {
      return NextResponse.json({ error: "Игрок не найден" }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({
    session: buildCardSession(data, cardCode, getFinancePrices(extras.settings), {
      freeroll: extras.settings.tournamentFormat === "freeroll",
    }),
  });
}

/** Takes the card back at the end of the evening and frees it for the next player. */
export async function DELETE(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const cardCode = normalizeCardCode(new URL(request.url).searchParams.get("code"));
  if (!cardCode) return NextResponse.json({ error: "Пустой код карты" }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("release_player_card", {
    p_tournament_id: t.id,
    p_card_code: cardCode,
  });

  if (error) throw error;
  if (!data) return NextResponse.json({ error: "Карта ни за кем не закреплена" }, { status: 404 });

  return NextResponse.json({ released: true });
}
