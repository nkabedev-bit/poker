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
    getUserSignups(auth.supabase, auth.user.id),
  ]);

  const mySignupEventIds = new Set(mySignups.map((signup) => signup.eventId));

  return NextResponse.json({
    events: upcoming.map((event) => ({
      ...event,
      signedUp: mySignupEventIds.has(event.id),
      signupsCount: signupCounts.get(event.id)?.total ?? 0,
    })),
    player: {
      // The home screen shows the player their own photo, uploaded or from Telegram.
      avatarIsCustom: Boolean(auth.user.avatar_is_custom),
      avatarUrl: auth.user.avatar_url,
      displayName: auth.user.display_name,
      freeEntries: {
        regular: Number(auth.user.free_entries ?? 0),
        vip: Number(auth.user.vip_free_entries ?? 0),
      },
      profileSubmitted: Boolean(auth.user.profile_submitted_at),
      // Somebody who signed in on the web and has answered nothing yet may still be a
      // club member of years standing: they are asked first whether they have played
      // here, rather than being marched straight into a new questionnaire.
      canClaimProfile: Boolean(auth.user.yandex_id) && !auth.user.profile_submitted_at,
      username: auth.user.username,
    },
  });
}
