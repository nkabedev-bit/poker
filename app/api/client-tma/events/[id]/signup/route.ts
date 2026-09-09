import { after, NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { notifyClientUser } from "@/lib/client-bot/notify";
import { countActiveSignups, getEvent, getUserSignups } from "@/lib/events/store";
import { waitlistOfferMessage } from "@/lib/events/waitlist";
import { offerFreedSeats } from "@/lib/events/waitlist-offers";
import { countFreeSeats, hasFreeSeat, offersDuoTicket, offersVipTicket } from "@/lib/events/seats";
import {
  cancelDuoPlusOne,
  createDuoInviteToken,
  duoCancelledMessage,
  duoInviteMessage,
  isPartnerTaken,
  readPartnerName,
  resolveDuoPartner,
} from "@/lib/events/duo";
import { claimEventSignup } from "@/lib/events/claim-signup";
import {
  isEventTicketType,
  isUpcomingEvent,
  passMatchesTicket,
  waitlistOfferIsLive,
} from "@/lib/events/types";
import { buildDuoInviteLinks } from "@/lib/events/duo-invite-links";

export const dynamic = "force-dynamic";

const PARTNER_ERRORS = {
  ambiguous: "Этот ник носят несколько игроков. Впишите напарника как гостя.",
  // Typed by hand while the club knows that nickname: picking them from the list is
  // what sends the invitation and puts the evening on their account.
  member_typed: "есть в клубе — выберите его из списка, чтобы ему пришло приглашение.",
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
  // The buyer either names somebody the club knows, or asks for a link to send to
  // somebody it does not.
  const wantsInvite = body.partnerMode === "invite";
  // Asking to be told when a place comes free, rather than taking one now.
  const wantsWaitlist = body.waitlist === true;
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
    ticketType === "duo" && !wantsInvite
      ? await resolveDuoPartner(auth.supabase, {
          partnerKey: body.partnerKey,
          partnerName,
          selfUserId: auth.user.id,
        })
      : { error: null, partner: null };

  if (ticketType === "duo" && !wantsInvite && (partner.error || !partner.partner)) {
    return NextResponse.json(
      {
        error: "partner_required",
        message: partner.error
          ? partner.error === "member_typed"
            ? `«${partnerName}» ${PARTNER_ERRORS.member_typed}`
            : PARTNER_ERRORS[partner.error]
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
  // A place in line is not a ticket: somebody stepping out of the queue for a seat that
  // just came free has to be counted against the room like anybody else, or two of them
  // would take the same chair. Neither is a seat that was given away — a player whose
  // place went to the queue asks the room for a new one, like anybody arriving late.
  const alreadyHeld =
    mine?.status !== "waitlist" && mine?.status !== "no_show" && mine?.ticketType === ticketType;

  // Standing in line is what a player does when there is no seat, so it is written down
  // without asking the room for one.
  if (wantsWaitlist) {
    const { error: waitError } = await auth.supabase.from("event_signups").upsert(
      {
        duo_confirmed_at: null,
        duo_invite_token: null,
        duo_partner_name: null,
        duo_partner_user_id: null,
        event_id: event.id,
        status: "waitlist",
        telegram_id: auth.user.telegram_id,
        ticket_type: ticketType,
        use_pass: "none",
        user_id: auth.user.id,
        // Joining the queue holds nothing. A row reused from an earlier turn would
        // otherwise carry that hold back in, keeping a seat for somebody who is only
        // asking to be told when one comes free.
        waitlist_offer_expires_at: null,
      },
      { onConflict: "event_id,user_id" },
    );

    if (waitError) throw waitError;

    return NextResponse.json({ signedUp: false, ticketType, waitlisted: true });
  }

  // The queue reached this player and the club is holding the seat for them: it is
  // counted as taken — by their own row — so the room reads full to everyone including
  // them. Theirs is the one hold that must not stand in their way.
  const holdsOffer =
    mine?.status === "waitlist" && waitlistOfferIsLive(mine.waitlistOfferExpiresAt, new Date());

  if (
    !alreadyHeld &&
    !holdsOffer &&
    !hasFreeSeat(countFreeSeats(event, counts.get(event.id)), ticketType)
  ) {
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

  // A link already sent out keeps working: the buyer opening their own ticket again
  // must not quietly break the one their friend is holding.
  const inviteToken =
    ticketType === "duo" && wantsInvite
      ? mine?.duoInviteToken ?? createDuoInviteToken()
      : null;

  // A cancelled request is reused rather than duplicated: the unique (event, player)
  // pair means a second insert would fail instead of putting the player back in.
  //
  // The seat is counted again inside the write. The check above reads the room and the
  // write happens a moment later, and in that moment somebody else can take the last
  // place: two players tapping "записаться" together both read "one left" and both got
  // it. The room is counted under the poster's own row lock here, so only one of them
  // can be the one who took it.
  const claim = await claimEventSignup(auth.supabase, {
    duoConfirmedAt: keptConfirmation,
    duoInviteToken: inviteToken,
    duoPartnerName: partner.partner?.name ?? null,
    duoPartnerUserId: partner.partner?.userId ?? null,
    eventId: event.id,
    status: "signed_up",
    telegramId: auth.user.telegram_id,
    ticketType,
    usePass,
    userId: auth.user.id,
  });

  if (claim === "full") {
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
    inviteLinks: await buildDuoInviteLinks(inviteToken),
    inviteToken,
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

  // A seat may have just come free, and the queue moves by one: the place is held for
  // whoever has waited longest and offered to nobody else. Somebody leaving the queue
  // frees a seat too — the one that was being held for them.
  if (event) {
    const offers = await offerFreedSeats(auth.supabase, event);

    if (offers.length > 0) {
      after(async () => {
        for (const offer of offers) {
          await notifyClientUser(
            auth.supabase,
            offer.userId,
            waitlistOfferMessage(event.title, offer.ticketType, offer.expiresAt),
          );
        }
      });
    }
  }

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
