import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { countActiveSignups, getEvent, getUserSignups } from "@/lib/events/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const id = (await params).id;
  const event = await getEvent(auth.supabase, id);

  if (!event || !event.isPublished) {
    return NextResponse.json({ error: "not_found", message: "Турнир не найден." }, { status: 404 });
  }

  const [signupCounts, mySignups] = await Promise.all([
    countActiveSignups(auth.supabase, [event.id]),
    getUserSignups(auth.supabase, auth.user.telegram_id),
  ]);

  return NextResponse.json({
    event: {
      ...event,
      signedUp: mySignups.some((signup) => signup.eventId === event.id),
      signupsCount: signupCounts.get(event.id) ?? 0,
    },
    profileSubmitted: Boolean(auth.user.profile_submitted_at),
  });
}
