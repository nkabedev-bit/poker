import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { countActiveSignups, listEventWaitlist } from "@/lib/events/store";
import { countFreeSeats } from "@/lib/events/seats";
import { pickWaitlistOffers, waitlistOfferDeadline } from "@/lib/events/waitlist";
import type { EventTicketType, TournamentEvent } from "@/lib/events/types";

/** A place now held for one player in the queue, and until when. */
export type WaitlistOffer = {
  expiresAt: Date;
  ticketType: EventTicketType;
  userId: string;
};

/**
 * Hands the places that are free right now to the players at the head of the queue.
 *
 * Called wherever a seat can come free — somebody cancels, somebody's half hour runs
 * out — and it is the same answer in both: count the room, take as many from the front
 * of the line as there are seats, hold each place for its player. Nothing is announced
 * here; the caller tells them, once the holds are written.
 *
 * The write is conditional, so two of these running at once cannot hold one seat twice:
 * a row that already carries a live hold updates nothing and is left out of the result.
 */
export async function offerFreedSeats(
  supabase: SupabaseClient,
  event: TournamentEvent,
  now: Date = new Date(),
): Promise<WaitlistOffer[]> {
  if (!event.isPublished) return [];

  // Sign-ups close at some hour, and holding a seat past it helps nobody.
  const deadline = waitlistOfferDeadline(event, now);
  if (!deadline) return [];

  const [waitlist, counts] = await Promise.all([
    listEventWaitlist(supabase, event.id),
    countActiveSignups(supabase, [event.id], now),
  ]);

  const picks = pickWaitlistOffers(waitlist, countFreeSeats(event, counts.get(event.id)), now);
  const offers: WaitlistOffer[] = [];

  for (const entry of picks) {
    const { data, error } = await supabase
      .from("event_signups")
      .update({
        waitlist_offer_expires_at: deadline.toISOString(),
        waitlist_offered_at: now.toISOString(),
      })
      .eq("id", entry.id)
      .eq("status", "waitlist")
      .or(
        `waitlist_offer_expires_at.is.null,waitlist_offer_expires_at.lte.${now.toISOString()}`,
      )
      .select("id");

    if (error) throw error;
    // Somebody got there first: the hold on this row is not ours to announce.
    if ((data ?? []).length === 0) continue;

    offers.push({ expiresAt: deadline, ticketType: entry.ticketType, userId: entry.userId });
  }

  return offers;
}

/**
 * Lets go of the holds nobody answered, so the seats can go on down the queue.
 *
 * Only the hold is dropped. `waitlist_offered_at` stays: it is what remembers that this
 * player has already had their turn, so the seat carries on down the line instead of
 * being offered back to them every half hour until the evening starts.
 *
 * Returns the accounts whose turn passed, for the message that says so.
 */
export async function expireWaitlistOffers(
  supabase: SupabaseClient,
  eventId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const { data, error } = await supabase
    .from("event_signups")
    .update({ waitlist_offer_expires_at: null })
    .eq("event_id", eventId)
    .eq("status", "waitlist")
    .not("waitlist_offer_expires_at", "is", null)
    .lte("waitlist_offer_expires_at", now.toISOString())
    .select("user_id");

  if (error) throw error;

  return (data ?? []).map((row) => String((row as { user_id: unknown }).user_id));
}
