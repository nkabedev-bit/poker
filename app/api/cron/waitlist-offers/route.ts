import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { notifyClientUser } from "@/lib/client-bot/notify";
import { getEvent } from "@/lib/events/store";
import { waitlistOfferMessage, waitlistOfferMissedMessage } from "@/lib/events/waitlist";
import { expireWaitlistOffers, offerFreedSeats } from "@/lib/events/waitlist-offers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Moves the waiting list on when nobody answers.
 *
 * A freed place is held for the player at the head of the queue for half an hour. That
 * is a promise the app cannot keep on its own: nothing happens when the time runs out
 * unless somebody looks. pg_cron looks every five minutes, and only calls this when
 * there is a hold that has actually run out — until then the club spends no requests
 * on an empty queue.
 *
 * Silence is an answer: the hold is let go, the player is told their turn passed and
 * that they are still in line, and the seat goes on to whoever is next.
 */
export async function POST(request: Request) {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json({ error: "Server env not configured" }, { status: 503 });
  }

  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();

  const { data: due, error } = await supabase
    .from("event_signups")
    .select("event_id")
    .eq("status", "waitlist")
    .not("waitlist_offer_expires_at", "is", null)
    .lte("waitlist_offer_expires_at", now.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eventIds = [...new Set((due ?? []).map((row) => String(row.event_id)))];
  let expired = 0;
  let offered = 0;

  for (const eventId of eventIds) {
    const event = await getEvent(supabase, eventId);
    if (!event) continue;

    const missed = await expireWaitlistOffers(supabase, eventId, now);
    // The seats are handed on only after the old holds are gone — they are the very
    // places being passed down the queue.
    const offers = await offerFreedSeats(supabase, event, now);

    for (const userId of missed) {
      await notifyClientUser(supabase, userId, waitlistOfferMissedMessage(event.title));
    }
    for (const offer of offers) {
      await notifyClientUser(
        supabase,
        offer.userId,
        waitlistOfferMessage(event.title, offer.ticketType, offer.expiresAt),
      );
    }

    expired += missed.length;
    offered += offers.length;
  }

  return NextResponse.json({ events: eventIds.length, expired, offered });
}
