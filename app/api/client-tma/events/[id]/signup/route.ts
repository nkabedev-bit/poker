import { after, NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { notifyClientUser } from "@/lib/client-bot/notify";
import { countActiveSignups, getEvent, getUserSignups } from "@/lib/events/store";
import { countFreeSeats, hasFreeSeat, offersDuoTicket, offersVipTicket } from "@/lib/events/seats";
import {
  cancelDuoPlusOne,
  duoCancelledMessage,
  duoInviteMessage,
  isPartnerTaken,
  readPartnerName,
  resolveDuoPartner,
} from "@/lib/events/duo";
import { isEventTicketType, isUpcomingEvent, passMatchesTicket } from "@/lib/events/types";

export const dynamic = "force-dynamic";

const PARTNER_ERRORS = {
  ambiguous: "Этот ник носят несколько игроков. Впишите напарника как гостя.",
  not_found: "Не нашли такого игрока. Впишите напарника как гостя.",
  self: "Нельзя привести самого себя — выберите напарника.",
} as const;

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
  const partner =
    ticketType === "duo"
      ? await resolveDuoPartner(auth.supabase, {
          partnerKey: body.partnerKey,
          partnerName,
          selfUserId: auth.user.id,
        })
      : { error: null, partner: null };

  if (ticketType === "duo" && (partner.error || !partner.partner)) {
    return NextResponse.json(
      {
        error: "partner_required",
        message: partner.error
          ? PARTNER_ERRORS[partner.error]
          : "Укажите, с кем придёте по билету 1+1.",
      },
      { status: 400 },
    );
  }

  // A member comes as the +1 of one ticket only. Checked here so the buyer is told to
  // pick somebody else, rather than being handed the database's refusal as a failure.
  if (
    partner.partner?.userId &&
    (await isPartnerTaken(auth.supabase, {
      eventId: event.id,
      hostUserId: auth.user.id,
      partnerUserId: partner.partner.userId,
    }))
  ) {
    return NextResponse.json(
      {
        error: "partner_taken",
        message: "Этого игрока уже зовут вторым на этот турнир. Выберите другого напарника.",
      },
      { status: 409 },
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

  const [counts, mySignups] = await Promise.all([
    countActiveSignups(auth.supabase, [event.id]),
    getUserSignups(auth.supabase, auth.user.id),
  ]);

  // A player already holding a ticket of this kind keeps it: naming a different partner
  // or re-sending the same choice must not be refused because their own sign-up filled
  // the last place.
  const mine = mySignups.find((signup) => signup.eventId === event.id) ?? null;
  const alreadyHeld = mine?.ticketType === ticketType;

  if (!alreadyHeld && !hasFreeSeat(countFreeSeats(event, counts.get(event.id)), ticketType)) {
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

  // Changing the partner starts the invitation over: the player who was asked before is
  // no longer coming, and their half of the ticket goes with them.
  const partnerChanged =
    mine?.duoPartnerUserId != null &&
    mine.duoPartnerUserId !== (partner.partner?.userId ?? null);
  // Naming the same partner again changes nothing, so their answer stands. Un-answering
  // them would strand the pair: their half of the ticket is written, which is exactly
  // what takes the banner they would answer through off their screen.
  const keptConfirmation =
    mine?.ticketType === "duo" &&
    mine.duoPartnerUserId != null &&
    mine.duoPartnerUserId === (partner.partner?.userId ?? null)
      ? mine.duoConfirmedAt ?? null
      : null;

  if (partnerChanged && mine) {
    await cancelDuoPlusOne(auth.supabase, { eventId: event.id, hostUserId: auth.user.id });
  }

  // A cancelled request is reused rather than duplicated: the unique (event, player)
  // pair means a second insert would fail instead of putting the player back in.
  const { error } = await auth.supabase.from("event_signups").upsert(
    {
      // Switching away from a "1+1" lets go of the partner it was bought for, and a new
      // partner has yet to answer.
      duo_confirmed_at: keptConfirmation,
      duo_partner_name: partner.partner?.name ?? null,
      duo_partner_user_id: partner.partner?.userId ?? null,
      event_id: event.id,
      status: "signed_up",
      telegram_id: auth.user.telegram_id,
      ticket_type: ticketType,
      use_pass: usePass,
      user_id: auth.user.id,
    },
    { onConflict: "event_id,user_id" },
  );

  if (error) throw error;

  // A partner who has already said yes is not asked again — there is nothing left for
  // them to answer, and the message would send them to a screen without the question.
  const invited = keptConfirmation ? null : partner.partner?.userId ?? null;
  // The player who was let go is told in the bot when they have one; a web player finds
  // the pair gone the next time they open the tournament.
  const dropped = partnerChanged ? mine?.duoPartnerUserId ?? null : null;

  // The bot carries the news once the sign-up stands, never before it: an invitation to
  // a ticket that failed to save would be a lie.
  after(async () => {
    const hostName = auth.user.display_name ?? "Игрок клуба";

    if (invited) {
      await notifyClientUser(auth.supabase, invited, duoInviteMessage(hostName, event.title));
    }
    if (dropped) {
      await notifyClientUser(auth.supabase, dropped, duoCancelledMessage(hostName, event.title));
    }
  });

  return NextResponse.json({
    partnerName: partner.partner?.name ?? null,
    signedUp: true,
    ticketType,
    usePass,
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const id = (await params).id;
  const mine = (await getUserSignups(auth.supabase, auth.user.id)).find(
    (signup) => signup.eventId === id,
  );

  const { error } = await auth.supabase
    .from("event_signups")
    .update({ status: "cancelled" })
    .eq("event_id", id)
    .eq("user_id", auth.user.id);

  if (error) throw error;

  // A pair falls together. Whichever half cancels, the other is left holding nothing:
  // the ticket was one, and the club has to hear about it from the app, not at the door.
  if (mine?.ticketType === "duo") {
    await cancelDuoPlusOne(auth.supabase, { eventId: id, hostUserId: auth.user.id });
  }

  if (mine?.ticketType === "duo_plus_one" && mine.duoHostUserId) {
    const { error: hostError } = await auth.supabase
      .from("event_signups")
      .update({ duo_confirmed_at: null, duo_partner_name: null, duo_partner_user_id: null })
      .eq("event_id", id)
      .eq("user_id", mine.duoHostUserId);

    if (hostError) throw hostError;
  }

  const event = await getEvent(auth.supabase, id);
  const told = mine?.ticketType === "duo" ? mine.duoPartnerUserId : mine?.duoHostUserId;

  if (event && told) {
    after(async () => {
      await notifyClientUser(
        auth.supabase,
        told,
        duoCancelledMessage(auth.user.display_name ?? "Игрок клуба", event.title),
      );
    });
  }

  return NextResponse.json({ signedUp: false });
}
