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

  const mySignup = mySignups.find((signup) => signup.eventId === event.id) ?? null;

  return NextResponse.json({
    event: {
      ...event,
      signedUp: Boolean(mySignup),
      signupsCount: signupCounts.get(event.id) ?? 0,
      usePass: mySignup?.usePass ?? "none",
    },
    freeEntries: {
      regular: Number(auth.user.free_entries ?? 0),
      vip: Number(auth.user.vip_free_entries ?? 0),
    },
    profileSubmitted: Boolean(auth.user.profile_submitted_at),
  });
}
