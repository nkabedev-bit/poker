import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { countActiveSignups, getEvent } from "@/lib/events/store";
import { countFreeSeats, hasFreeSeat, offersDuoTicket, offersVipTicket } from "@/lib/events/seats";
import { isEventTicketType, isUpcomingEvent, passMatchesTicket } from "@/lib/events/types";

export const dynamic = "force-dynamic";

const MAX_PARTNER_NAME_LENGTH = 40;

/** The guest a "1+1" brings, as the buyer wrote them down at the door of the app. */
function readPartnerName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_PARTNER_NAME_LENGTH);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  // Until the sign-up form moves into the mini-app, the questionnaire still lives in
  // the bot and the club needs it filled in before anyone takes a seat.
  if (!auth.user.profile_submitted_at) {
    return NextResponse.json(
      { error: "profile_required", message: "Сначала заполните анкету в боте." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const requestedTicket = isEventTicketType(body.ticketType) ? body.ticketType : "regular";
  const partnerName = readPartnerName(body.partnerName);
  // What the player chose to pay with. Nothing is spent here: a pass is only used when
  // they turn up and are seated, so an intention costs nothing if they never come.
  const requestedPass = body.usePass === "vip" ? "vip" : body.usePass === "regular" ? "regular" : "none";
  const held =
    requestedPass === "vip"
      ? Number(auth.user.vip_free_entries ?? 0)
      : requestedPass === "regular"
        ? Number(auth.user.free_entries ?? 0)
        : 0;

  const id = (await params).id;
  const event = await getEvent(auth.supabase, id);

  if (!event || !event.isPublished) {
    return NextResponse.json({ error: "not_found", message: "Турнир не найден." }, { status: 404 });
  }

  if (!isUpcomingEvent(event, new Date())) {
    return NextResponse.json(
      { error: "closed", message: "Запись на этот турнир уже закрыта." },
      { status: 409 },
    );
  }

  const wantsDuo = requestedTicket === "duo" && offersDuoTicket(event);
  const ticketType = wantsDuo
    ? "duo"
    : requestedTicket === "vip" && offersVipTicket(event)
      ? "vip"
      : "regular";

  // A "1+1" is bought for two, and the club needs to know who the second one is: the
  // whole point of the ticket is that the +1 is expected by name, not a surprise.
  if (ticketType === "duo" && !partnerName) {
    return NextResponse.json(
      { error: "partner_required", message: "Укажите, с кем придёте по билету 1+1." },
      { status: 400 },
    );
  }

  // A pass opens the seat of its own kind only, and one the player still holds. It buys
  // a single ticket, so it never covers a pair — the "1+1" already has its own price.
  const usePass =
    ticketType !== "duo" &&
    requestedPass !== "none" &&
    held > 0 &&
    passMatchesTicket(requestedPass, ticketType)
      ? requestedPass
      : "none";

  const counts = await countActiveSignups(auth.supabase, [event.id]);
  // A player already holding a seat of this kind keeps it: re-sending the same choice
  // must not be refused because their own sign-up filled the last place.
  if (!hasFreeSeat(countFreeSeats(event, counts.get(event.id)), ticketType)) {
    return NextResponse.json(
      {
        error: "full",
        message:
          ticketType === "vip"
            ? "VIP-места разобрали. Выберите обычный билет или напишите в поддержку."
            : ticketType === "duo"
              ? "Билеты 1+1 разобрали. Выберите обычный билет или напишите в поддержку."
              : "Все места разобрали. Напишите в поддержку.",
      },
      { status: 409 },
    );
  }

  // A cancelled request is reused rather than duplicated: the unique (event, player)
  // pair means a second insert would fail instead of putting the player back in.
  const { error } = await auth.supabase.from("event_signups").upsert(
    {
      // Switching away from a "1+1" lets go of the partner it was bought for.
      duo_partner_name: ticketType === "duo" ? partnerName : null,
      event_id: event.id,
      status: "signed_up",
      telegram_id: auth.user.telegram_id,
      ticket_type: ticketType,
      use_pass: usePass,
    },
    { onConflict: "event_id,telegram_id" },
  );

  if (error) throw error;

  return NextResponse.json({
    partnerName: ticketType === "duo" ? partnerName : null,
    signedUp: true,
    ticketType,
    usePass,
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const id = (await params).id;

  const { error } = await auth.supabase
    .from("event_signups")
    .update({ status: "cancelled" })
    .eq("event_id", id)
    .eq("telegram_id", auth.user.telegram_id);

  if (error) throw error;

  return NextResponse.json({ signedUp: false });
}
