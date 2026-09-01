import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { syncVipSheet } from "@/lib/google-sheets";
import { buildCardSession, isTicketType, normalizeCardCode } from "@/lib/cards/card-code";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import {
  appendTournamentPlayerWithRegistrationNumber,
  buildAdminRegistrationFullMessage,
  isTournamentRegistrationCapacityError,
} from "@/lib/tournament-player-registration";
import type { TournamentPlayer } from "@/lib/timer/types";

export const dynamic = "force-dynamic";

/** Seats a player who signed up: the sign-up becomes a row in the live roster. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id, public_token, starting_stack")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const id = (await params).id;
  const body = await request.json().catch(() => ({}));
  const tableNumber = Number(body.table);
  // Seating and handing over a card are one movement at the door, so the card travels
  // with this request instead of costing a second round trip.
  const cardCode = normalizeCardCode(body.cardCode);
  const ticketType = isTicketType(body.ticketType) ? body.ticketType : "regular";

  const { data: signup, error: signupError } = await auth.supabase
    .from("event_signups")
    .select("id, telegram_id, status, client_bot_users(display_name)")
    .eq("id", id)
    .maybeSingle();

  if (signupError) throw signupError;
  if (!signup) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const tablesCount = Math.max(1, Number(extras.settings.tablesCount ?? 1));
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > tablesCount) {
    return NextResponse.json({ error: "Выберите номер стола" }, { status: 400 });
  }

  const telegramId = Number((signup as { telegram_id: unknown }).telegram_id);
  const embedded = (signup as Record<string, unknown>).client_bot_users;
  const player = (Array.isArray(embedded) ? embedded[0] : embedded) as
    | { display_name?: string | null }
    | undefined;
  const name = player?.display_name?.trim();

  if (!name) {
    return NextResponse.json({ error: "У игрока нет никнейма в анкете" }, { status: 400 });
  }

  const alreadySeated = extras.players.find((item) => Number(item.telegramId) === telegramId);
  if (alreadySeated) {
    await auth.supabase.from("event_signups").update({ status: "seated" }).eq("id", id);
    return NextResponse.json({ alreadySeated: true, player: alreadySeated });
  }

  const playerDraft: TournamentPlayer = {
    addons: 0,
    bountyChipsTotal: 0,
    bountyCount: 0,
    finishPlace: null,
    id: crypto.randomUUID(),
    name,
    rebuys: 0,
    registeredVia: "client_bot",
    seat: null,
    stack: t.starting_stack,
    status: "active",
    table: tableNumber,
    telegramId,
  };

  let seatedPlayer;
  try {
    seatedPlayer = await appendTournamentPlayerWithRegistrationNumber({
      extras,
      player: playerDraft,
      publicToken: t.public_token,
      redirectTo: "/tma/players",
      supabase: auth.supabase,
      tournamentId: t.id,
    });
  } catch (error) {
    if (isTournamentRegistrationCapacityError(error)) {
      return NextResponse.json(
        { error: buildAdminRegistrationFullMessage(extras.players.length) },
        { status: 409 },
      );
    }
    throw error;
  }

  let session = null;
  if (cardCode) {
    const { data: carded, error: cardError } = await auth.supabase.rpc("assign_player_card", {
      p_tournament_id: t.id,
      p_player_id: seatedPlayer.id,
      p_card_code: cardCode,
      p_ticket_type: ticketType,
    });

    // The player is seated by now, and a clashing card must not undo that: the seat
    // stands, the admin is told, and they scan a different card.
    if (cardError) {
      const message = String(cardError.message ?? "");
      if (!message.includes("Card already issued")) throw cardError;

      session = null;
      await auth.supabase.from("event_signups").update({ status: "seated" }).eq("id", id);

      return NextResponse.json({
        cardError: "Эта карта уже выдана другому игроку",
        player: seatedPlayer,
      });
    }

    session = buildCardSession(carded, cardCode);
  }

  await auth.supabase.from("event_signups").update({ status: "seated" }).eq("id", id);
  await auth.supabase
    .from("client_bot_users")
    .update({ registered_at: new Date().toISOString(), registered_player_id: seatedPlayer.id })
    .eq("telegram_id", telegramId);

  try {
    await syncVipSheet(auth.supabase, t.id);
  } catch (sheetError) {
    console.error("Failed to sync VIP sheet", sheetError);
  }

  return NextResponse.json({ player: seatedPlayer, session });
}
