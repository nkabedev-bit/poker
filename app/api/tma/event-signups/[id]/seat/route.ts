import { after, NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { syncVipSheet } from "@/lib/google-sheets";
import { buildCardSession, isTicketType, normalizeCardCode } from "@/lib/cards/card-code";
import { getFinancePrices } from "@/lib/finance/player-charge";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import {
  appendTournamentPlayerWithRegistrationNumber,
  buildAdminRegistrationFullMessage,
  isTournamentRegistrationCapacityError,
} from "@/lib/tournament-player-registration";
import type { TournamentPlayer } from "@/lib/timer/types";
import { SEATS_PER_TABLE } from "@/lib/tables/seating";

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
  const seatNumber = Number(body.seat);
  // Seating and handing over a card are one movement at the door, so the card travels
  // with this request instead of costing a second round trip.
  const cardCode = normalizeCardCode(body.cardCode);
  const ticketType = isTicketType(body.ticketType) ? body.ticketType : "regular";
  // Seating somebody out of the queue: whose place they are taking. A player standing
  // in line has no seat of their own, so they only ever come in instead of someone who
  // signed up and did not turn up.
  const replacesSignupId = String(body.replacesSignupId ?? "").trim();

  // `!user_id` picks the account the sign-up belongs to: several columns of the row
  // point at client_bot_users, and an unnamed embed is ambiguous.
  const { data: signup, error: signupError } = await auth.supabase
    .from("event_signups")
    .select(
      "id, event_id, user_id, telegram_id, status, use_pass, ticket_type, client_bot_users!user_id(display_name, free_entries, vip_free_entries)",
    )
    .eq("id", id)
    .maybeSingle();

  if (signupError) throw signupError;
  if (!signup) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

  const signupStatus = String((signup as { status?: unknown }).status ?? "");
  const signupEventId = String((signup as { event_id?: unknown }).event_id ?? "");

  // A place in the queue is not a ticket: it becomes one only in somebody's stead, and
  // the desk says whose. Without that the room would quietly hold one player more than
  // the poster sold.
  if (signupStatus === "waitlist" && !replacesSignupId) {
    return NextResponse.json(
      { error: "Выберите, вместо кого сажаем игрока из листа ожидания" },
      { status: 400 },
    );
  }

  let replaced: { id: string; name: string } | null = null;
  if (replacesSignupId) {
    if (replacesSignupId === id) {
      return NextResponse.json({ error: "Игрок не может заменить сам себя" }, { status: 400 });
    }

    const { data: absentee, error: absenteeError } = await auth.supabase
      .from("event_signups")
      .select("id, event_id, status, client_bot_users!user_id(display_name)")
      .eq("id", replacesSignupId)
      .maybeSingle();

    if (absenteeError) throw absenteeError;
    if (!absentee || String((absentee as { event_id?: unknown }).event_id ?? "") !== signupEventId) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    // Somebody already at a table is not a no-show, and their seat is not free to give.
    if (String((absentee as { status?: unknown }).status ?? "") === "seated") {
      return NextResponse.json({ error: "Этот игрок уже за столом" }, { status: 409 });
    }

    const absenteeEmbed = (absentee as Record<string, unknown>).client_bot_users;
    const absenteePlayer = (Array.isArray(absenteeEmbed) ? absenteeEmbed[0] : absenteeEmbed) as
      | { display_name?: string | null }
      | undefined;

    replaced = {
      id: replacesSignupId,
      name: absenteePlayer?.display_name?.trim() || "Игрок",
    };
  }

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const tablesCount = Math.max(1, Number(extras.settings.tablesCount ?? 1));
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > tablesCount) {
    return NextResponse.json({ error: "Выберите номер стола" }, { status: 400 });
  }

  if (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > SEATS_PER_TABLE) {
    return NextResponse.json({ error: "Выберите место за столом" }, { status: 400 });
  }

  // A player who signed in on the web has no Telegram id at all: `Number(null)` is 0,
  // and seating two of them would have them share a seat. The account is what tells
  // them apart, and the Telegram id is only carried when there really is one.
  const rawTelegramId = Number((signup as { telegram_id: unknown }).telegram_id);
  const telegramId = Number.isInteger(rawTelegramId) && rawTelegramId > 0 ? rawTelegramId : null;
  const accountId = String((signup as { user_id: unknown }).user_id ?? "") || null;
  const embedded = (signup as Record<string, unknown>).client_bot_users;
  const player = (Array.isArray(embedded) ? embedded[0] : embedded) as
    | { display_name?: string | null; free_entries?: number | null; vip_free_entries?: number | null }
    | undefined;
  const name = player?.display_name?.trim();

  if (!name) {
    return NextResponse.json({ error: "У игрока нет никнейма в анкете" }, { status: 400 });
  }

  const alreadySeated = extras.players.find((item) =>
    accountId && item.accountId
      ? item.accountId === accountId
      : telegramId !== null && Number(item.telegramId) === telegramId,
  );
  if (alreadySeated) {
    await auth.supabase.from("event_signups").update({ status: "seated" }).eq("id", id);
    return NextResponse.json({ alreadySeated: true, player: alreadySeated });
  }

  // Two people cannot be given one chair: the admin seats players one at a time, and
  // between opening the plan and tapping it someone else may have taken the seat.
  const seatTaken = extras.players.find(
    (item) =>
      item.status === "active" && item.table === tableNumber && item.seat === seatNumber,
  );

  if (seatTaken) {
    return NextResponse.json(
      { error: `Место ${seatNumber} за столом ${tableNumber} занято: ${seatTaken.name}` },
      { status: 409 },
    );
  }

  // The player picked a free entry when signing up; it is spent here, at the door, and
  // only if they still hold one of that exact kind — a VIP pass never covers a regular
  // seat and the other way round.
  const requestedPass = (signup as { use_pass?: unknown }).use_pass;
  const heldPasses =
    requestedPass === "vip"
      ? Number(player?.vip_free_entries ?? 0)
      : requestedPass === "regular"
        ? Number(player?.free_entries ?? 0)
        : 0;
  const passUsed = heldPasses > 0 ? (requestedPass as "regular" | "vip") : null;
  // A pass decides the ticket: what the admin picked on screen cannot contradict it.
  const seatTicketType = passUsed ?? ticketType;
  // Half a "1+1" is charged half its price, and only the sign-up may say so — the desk
  // cannot hand out the discount by picking it on screen. The seat itself stays regular:
  // the pair plays at the ordinary tables and draws ordinary registration numbers.
  // A queue entry says what the player hoped for, not what they got: the desk picks the
  // ticket at the door, and a pair ticket is not among the choices — nobody is coming
  // in with them.
  const signupTicket = signupStatus === "waitlist" ? ticketType : (signup as { ticket_type?: unknown }).ticket_type;
  const duoTicket = signupTicket === "duo" || signupTicket === "duo_plus_one";

  const playerDraft: TournamentPlayer = {
    accountId,
    addons: 0,
    duoTicket,
    freePass: passUsed,
    bountyChipsTotal: 0,
    bountyCount: 0,
    finishPlace: null,
    id: crypto.randomUUID(),
    name,
    rebuys: 0,
    registeredVia: "client_bot",
    seat: seatNumber,
    stack: t.starting_stack,
    status: "active",
    table: tableNumber,
    telegramId,
    // The registration number is drawn from the VIP range by ticket, so the ticket has
    // to be on the player before the number is handed out.
    ticketType: seatTicketType,
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

  // A queue entry that has been seated is a ticket now, of the kind the desk picked.
  const seatedUpdate =
    signupStatus === "waitlist"
      ? { status: "seated", ticket_type: seatTicketType }
      : { status: "seated" };

  // Their place was given away, and the record says so: not "cancelled", which would
  // read as a player who changed their mind, but a seat that went to the queue.
  const markAbsentee = async () => {
    if (!replaced) return;

    const { error: absenteeError } = await auth.supabase
      .from("event_signups")
      .update({ status: "no_show" })
      .eq("id", replaced.id);

    if (absenteeError) console.error("Failed to mark a no-show", absenteeError);
  };

  const spendPass = async () => {
    if (!passUsed) return;

    const column = passUsed === "vip" ? "vip_free_entries" : "free_entries";
    const { error: passError } = await auth.supabase
      .from("client_bot_users")
      .update({ [column]: Math.max(0, heldPasses - 1) })
      .eq("id", accountId);

    if (passError) console.error("Failed to spend a free entry", passError);
  };

  let session = null;
  if (cardCode) {
    const { data: carded, error: cardError } = await auth.supabase.rpc("assign_player_card", {
      p_tournament_id: t.id,
      p_player_id: seatedPlayer.id,
      p_card_code: cardCode,
      p_ticket_type: seatTicketType,
    });

    // The player is seated by now, and a clashing card must not undo that: the seat
    // stands, the admin is told, and they scan a different card.
    if (cardError) {
      const message = String(cardError.message ?? "");
      if (!message.includes("Card already issued")) throw cardError;

      session = null;
      await auth.supabase.from("event_signups").update(seatedUpdate).eq("id", id);
      await markAbsentee();
      await spendPass();

      return NextResponse.json({
        cardError: "Эта карта уже выдана другому игроку",
        passUsed,
        player: seatedPlayer,
        replacedName: replaced?.name ?? null,
      });
    }

    session = buildCardSession(carded, cardCode, getFinancePrices(extras.settings), {
      freeroll: extras.settings.tournamentFormat === "freeroll",
    });
  }

  await auth.supabase.from("event_signups").update(seatedUpdate).eq("id", id);
  await markAbsentee();
  await auth.supabase
    .from("client_bot_users")
    .update({ registered_at: new Date().toISOString(), registered_player_id: seatedPlayer.id })
    .eq("id", accountId);

  await spendPass();

  // Same reason as everywhere else: the admin is handing over a card, not waiting for
  // Google to acknowledge a row.
  after(async () => {
    try {
      await syncVipSheet(auth.supabase, t.id);
    } catch (sheetError) {
      console.error("Failed to sync VIP sheet", sheetError);
    }
  });

  return NextResponse.json({
    passUsed,
    player: seatedPlayer,
    // Whose place this was, so the desk can say it out loud when it hands the card over.
    replacedName: replaced?.name ?? null,
    session,
  });
}
