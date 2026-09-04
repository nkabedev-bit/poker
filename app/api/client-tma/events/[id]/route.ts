import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { countActiveSignups, getEvent, getUserSignups } from "@/lib/events/store";
import { countFreeSeats } from "@/lib/events/seats";

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
  const taken = signupCounts.get(event.id);

  return NextResponse.json({
    event: {
      ...event,
      // What the player already asked for, so the page can say it back to them —
      // including the guest they are bringing on a "1+1".
      partnerName: mySignup?.duoPartnerName ?? null,
      signedUp: Boolean(mySignup),
      signupsCount: taken?.total ?? 0,
      ticketType: mySignup?.ticketType ?? "regular",
      usePass: mySignup?.usePass ?? "none",
    },
    freeSeats: countFreeSeats(event, taken),
    freeEntries: {
      regular: Number(auth.user.free_entries ?? 0),
      vip: Number(auth.user.vip_free_entries ?? 0),
    },
    profileSubmitted: Boolean(auth.user.profile_submitted_at),
  });
}
