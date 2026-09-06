import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { listReservations, releaseReservation, reserveTicket } from "@/lib/events/reservations";

export const dynamic = "force-dynamic";

const MESSAGES = {
  ambiguous: "Этот ник носят несколько игроков — уточните.",
  not_found: "Не нашли резидента с таким ником.",
  taken: "Игрок уже записался на этот турнир сам.",
} as const;

/** The tickets being held for one poster. */
export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!eventId) return NextResponse.json({ error: "Не выбрана афиша" }, { status: 400 });

  return NextResponse.json({ reservations: await listReservations(auth.supabase, eventId) });
}

/** Holds one, for a resident the club knows by nickname. */
export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const eventId = String(body.eventId ?? "");
  if (!eventId) return NextResponse.json({ error: "Не выбрана афиша" }, { status: 400 });

  const outcome = await reserveTicket(auth.supabase, {
    eventId,
    nickname: String(body.nickname ?? ""),
    ticketType: body.ticketType === "vip" ? "vip" : "regular",
  });

  if (outcome.error) {
    return NextResponse.json({ error: MESSAGES[outcome.error] }, { status: 404 });
  }

  return NextResponse.json({ reservations: await listReservations(auth.supabase, eventId) });
}

/** Takes one back, freeing the seat it was keeping. */
export async function DELETE(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!eventId || !id) return NextResponse.json({ error: "Не выбран билет" }, { status: 400 });

  await releaseReservation(auth.supabase, { eventId, id });

  return NextResponse.json({ reservations: await listReservations(auth.supabase, eventId) });
}
