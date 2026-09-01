import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { countActiveSignups, getEvent } from "@/lib/events/store";
import { isUpcomingEvent } from "@/lib/events/types";

export const dynamic = "force-dynamic";

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

  if (event.maxPlayers) {
    const counts = await countActiveSignups(auth.supabase, [event.id]);
    const taken = counts.get(event.id) ?? 0;
    if (taken >= event.maxPlayers) {
      return NextResponse.json(
        { error: "full", message: "Все места разобрали. Напишите в поддержку." },
        { status: 409 },
      );
    }
  }

  // A cancelled request is reused rather than duplicated: the unique (event, player)
  // pair means a second insert would fail instead of putting the player back in.
  const { error } = await auth.supabase.from("event_signups").upsert(
    {
      event_id: event.id,
      status: "signed_up",
      telegram_id: auth.user.telegram_id,
    },
    { onConflict: "event_id,telegram_id" },
  );

  if (error) throw error;

  return NextResponse.json({ signedUp: true });
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
