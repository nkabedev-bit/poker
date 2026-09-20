import { after, NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { countActiveSignups, getUserSignups, listEvents } from "@/lib/events/store";
import {
  holdsTicket,
  isEventEveningOpen,
  isUpcomingEvent,
  waitlistOfferIsLive,
} from "@/lib/events/types";
import { findDuoInvitationEventIds } from "@/lib/events/duo";
import { announcePublishedEvents, publishDueEvents } from "@/lib/events/scheduled-publication";
import { readClientLiveState } from "@/lib/client-tma/live-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const now = new Date();
  // A draft whose time has come goes up the moment anybody looks, instead of waiting for
  // the five-minute job; the messages about held tickets go out after the answer.
  const justPublished = await publishDueEvents(auth.supabase, now);
  if (justPublished.length > 0) {
    after(() => announcePublishedEvents(auth.supabase, justPublished));
  }

  const published = await listEvents(auth.supabase, { publishedOnly: true });

  const [mySignups, live] = await Promise.all([
    getUserSignups(auth.supabase, auth.user.id),
    // Carried with the screen it is drawn on: a card for the game under way would
    // otherwise cost every phone an extra round trip the moment the app opens. The
    // blind grid rides along once, and the countdown then runs on the phone.
    readClientLiveState(auth.supabase, { includeLevels: true }).catch((error) => {
      // The posters are the point of this screen; a missing card is not worth losing them.
      console.error("Failed to read the live tournament state", error);
      return null;
    }),
  ]);

  // The posters still to come, and — while the cards are in the air — the one being
  // played. A game that has begun stays up only as long as it is actually being played:
  // the clock says when it is over, and once the desk finishes it the evening belongs
  // to the results rather than to a board still offering seats at it.
  const upcoming = published.filter(
    (event) => isUpcomingEvent(event, now) || (live !== null && isEventEveningOpen(event, now)),
  );

  const signupCounts = await countActiveSignups(
    auth.supabase,
    upcoming.map((event) => event.id),
  );

  const mineByEvent = new Map(mySignups.map((signup) => [signup.eventId, signup]));
  // Somebody may be waiting on this player at one of these evenings, or the club may be
  // holding a ticket for them: either way the card says so before they open it.
  const invitedTo = await findDuoInvitationEventIds(auth.supabase, {
    eventIds: upcoming.map((event) => event.id),
    userId: auth.user.id,
  });

  return NextResponse.json({
    // The game being played right now, or null when the room is quiet.
    live,
    events: upcoming.map((event) => {
      const mine = mineByEvent.get(event.id);
      const status = mine?.status;

      return {
        ...event,
        // What the club is waiting on this player to answer, if anything.
        // A partner who has already answered is not in the invitation query at all.
        awaiting:
          status === "reserved"
            ? ("reserved" as const)
            : invitedTo.has(event.id)
              ? ("duo" as const)
              : null,
        signedUp: holdsTicket(status),
        signupsCount: signupCounts.get(event.id)?.total ?? 0,
        waitlisted: status === "waitlist",
        // A place is being held for them right now, and the bot's message only opens
        // the app: without this the card would look like any other evening they are
        // waiting on, and the half hour would run out on the wrong screen.
        waitlistOffered:
          status === "waitlist" && waitlistOfferIsLive(mine?.waitlistOfferExpiresAt ?? null, now),
      };
    }),
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
