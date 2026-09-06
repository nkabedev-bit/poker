import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import {
  buildCardSession,
  isTicketType,
  normalizeCardCode,
} from "@/lib/cards/card-code";
import { getFinancePrices } from "@/lib/finance/player-charge";
import { applySeatingTicket } from "@/lib/tournament-player-registration";
import { getSettlingPlayers } from "@/lib/timer/lifecycle";

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
  // Tournaments saved before the setting existed were played with cards.
  const cardsEnabled = extras.settings.cardsEnabled !== false;

  const cardCode = normalizeCardCode(new URL(request.url).searchParams.get("code"));

  // Without a code the screen is asking for the evening as a whole: every card that is
  // out, so the desk can see who still owes money.
  if (!cardCode) {
    return NextResponse.json({
      cardsEnabled,
      issued: getSettlingPlayers(extras)
        // Everybody the desk still has business with. A player who busted an hour ago
        // owes for their re-entries just the same, and without a card to scan there is
        // no other way back to them — so they stay until they have settled.
        .filter((item) => (cardsEnabled ? Boolean(item.cardCode) : Boolean(item.table)))
        .filter((item) => item.status === "active" || item.paid !== true)
        .map((item) => buildCardSession(item, String(item.cardCode ?? ""), prices, { freeroll }))
        .sort((a, b) => (a.registrationNumber ?? 0) - (b.registrationNumber ?? 0)),
    });
  }

  const player = getSettlingPlayers(extras).find((item) => item.cardCode === cardCode);

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
  const cardsEnabled = extras.settings.cardsEnabled !== false;
  const body = await request.json().catch(() => ({}));
  const cardCode = normalizeCardCode(body.cardCode);
  const playerId = String(body.playerId ?? "");
  const ticketType = isTicketType(body.ticketType) ? body.ticketType : "regular";
  const tableNumber = Number(body.table);
  const seatNumber = Number(body.seat);

  // On an evening played without cards there is no code to ask for: the chair is the
  // whole of what is being handed over.
  if (cardsEnabled && !cardCode) {
    return NextResponse.json({ error: "Пустой код карты" }, { status: 400 });
  }
  if (!playerId) return NextResponse.json({ error: "Не выбран игрок" }, { status: 400 });

  // Handing over a card is also when the player is told where to sit, so the chair
  // travels with it — a walk-in added by hand has a table but no seat of their own.
  if (Number.isInteger(tableNumber) && Number.isInteger(seatNumber)) {
    const { error: seatError } = await auth.supabase.rpc("seat_tournament_player", {
      p_tournament_id: t.id,
      p_player_id: playerId,
      p_table: tableNumber,
      p_seat: seatNumber,
    });

    if (seatError) {
      const message = String(seatError.message ?? "");
      if (message.includes("Seat already taken")) {
        return NextResponse.json(
          { error: `Место ${seatNumber} за столом ${tableNumber} уже занято` },
          { status: 409 },
        );
      }
      if (message.includes("Player not found")) {
        return NextResponse.json({ error: "Игрок не найден" }, { status: 404 });
      }
      throw seatError;
    }
  }

  // The desk has just chosen the ticket, and on an evening without cards nothing else
  // would write it down — the card RPC below is skipped. The number follows the ticket,
  // so a walk-in who had none gets theirs here too.
  const seatedExtras = await loadTournamentExtras(t.id, auth.supabase);
  await applySeatingTicket({
    extras: seatedExtras,
    playerId,
    redirectTo: "/tma/players",
    supabase: auth.supabase,
    ticketType,
  });

  if (!cardCode) {
    // Nothing to hand over but the seat, which is already saved. The player is read
    // back so the desk sees the same card it would have seen with one.
    const seated = await loadTournamentExtras(t.id, auth.supabase);
    const player = seated.players.find((item) => item.id === playerId);

    if (!player) return NextResponse.json({ error: "Игрок не найден" }, { status: 404 });

    return NextResponse.json({
      session: buildCardSession(player, "", getFinancePrices(seated.settings), {
        freeroll: seated.settings.tournamentFormat === "freeroll",
      }),
    });
  }

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
