import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { countActiveSignups, getUserSignups, listEvents } from "@/lib/events/store";
import { isUpcomingEvent } from "@/lib/events/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const now = new Date();
  const published = await listEvents(auth.supabase, { publishedOnly: true });
  const upcoming = published.filter((event) => isUpcomingEvent(event, now));

  const [signupCounts, mySignups] = await Promise.all([
    countActiveSignups(auth.supabase, upcoming.map((event) => event.id)),
    getUserSignups(auth.supabase, auth.user.telegram_id),
  ]);

  const mySignupEventIds = new Set(mySignups.map((signup) => signup.eventId));

  return NextResponse.json({
    events: upcoming.map((event) => ({
      ...event,
      signedUp: mySignupEventIds.has(event.id),
      signupsCount: signupCounts.get(event.id) ?? 0,
    })),
    player: {
      displayName: auth.user.display_name,
      profileSubmitted: Boolean(auth.user.profile_submitted_at),
      username: auth.user.username,
    },
  });
}
