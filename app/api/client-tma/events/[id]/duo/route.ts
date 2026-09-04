import { after, NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { notifyClientUser } from "@/lib/client-bot/notify";
import { getEvent } from "@/lib/events/store";
import { duoAnswerMessage, findDuoInvitation } from "@/lib/events/duo";
import { isUpcomingEvent } from "@/lib/events/types";

export const dynamic = "force-dynamic";

/**
 * The +1's answer to a pair invitation.
 *
 * Accepting writes their own half of the ticket, which is what the desk seats them by;
 * refusing hands the ticket back to the buyer with the partner cleared, so they can ask
 * someone else without losing the pair they already paid for.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  if (!auth.user.profile_submitted_at) {
    return NextResponse.json(
      { error: "profile_required", message: "Сначала заполните анкету в боте." },
      { status: 403 },
    );
  }

  const id = (await params).id;
  const body = await request.json().catch(() => ({}));
  const accepted = body.accept !== false;

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

  const invitation = await findDuoInvitation(auth.supabase, {
    eventId: id,
    telegramId: auth.user.telegram_id,
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "no_invite", message: "Приглашение больше не действует." },
      { status: 404 },
    );
  }

  if (accepted) {
    // The +1 takes nothing from the poster's allotments: their seat was sold with the
    // ticket the host already holds, so there is no room left to check here.
    const { error } = await auth.supabase.from("event_signups").upsert(
      {
        duo_host_telegram_id: invitation.hostTelegramId,
        event_id: id,
        status: "signed_up",
        telegram_id: auth.user.telegram_id,
        ticket_type: "duo_plus_one",
        // A pass buys one ticket, and this one is already bought and paid for as a pair.
        use_pass: "none",
      },
      { onConflict: "event_id,telegram_id" },
    );

    if (error) throw error;
  }

  const { error: hostError } = await auth.supabase
    .from("event_signups")
    .update(
      accepted
        ? { duo_confirmed_at: new Date().toISOString() }
        : { duo_confirmed_at: null, duo_partner_name: null, duo_partner_telegram_id: null },
    )
    .eq("event_id", id)
    .eq("telegram_id", invitation.hostTelegramId);

  if (hostError) throw hostError;

  after(async () => {
    await notifyClientUser(
      auth.supabase,
      invitation.hostTelegramId,
      duoAnswerMessage(auth.user.display_name ?? "Напарник", event.title, accepted),
    );
  });

  return NextResponse.json({ joined: accepted });
}
