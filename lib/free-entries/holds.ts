import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isEventOpenForSeating, mapEventRow, type FreePassChoice } from "@/lib/events/types";

export type HeldPass = Exclude<FreePassChoice, "none">;

/** A pass written down against a game the player has not played yet. */
export type PassHold = { eventId: string; pass: HeldPass; startsAt: string; title: string };

/**
 * The sign-ups whose pass is still promised: a ticket the player holds and has not used.
 * A seated player has spent theirs, and a cancelled or given-away sign-up promises
 * nothing. claim_event_signup counts the same statuses — keep the two in step.
 */
const PASS_HOLDING_STATUSES = ["signed_up", "reserved"] as const;

/**
 * The passes a player has already promised to games still ahead of them, soonest first.
 *
 * A pass is only spent at the door, so signing up merely writes down which one the player
 * will pay with — and nothing stopped them writing their single pass down for three
 * evenings at once. A sign-up keeps its pass while its evening can still be played:
 * cancelling, being given away as a no-show, or the night simply ending without them
 * hands it back, with nobody having to remember to return it.
 */
export async function loadPassHolds(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<PassHold[]> {
  const { data, error } = await supabase
    .from("event_signups")
    .select("use_pass, tournament_events(id, title, starts_at, late_entry_until)")
    .eq("user_id", userId)
    .in("status", PASS_HOLDING_STATUSES)
    .in("use_pass", ["regular", "vip"]);

  if (error) throw error;

  return (data ?? [])
    .flatMap((row) => {
      const record = row as Record<string, unknown>;
      // PostgREST hands a to-one embed back as an object, older versions as an array.
      const embedded = record.tournament_events;
      const eventRow = (Array.isArray(embedded) ? embedded[0] : embedded) as
        | Record<string, unknown>
        | undefined;
      if (!eventRow) return [];

      const event = mapEventRow(eventRow);
      if (!isEventOpenForSeating(event, now)) return [];

      const hold: PassHold = {
        eventId: event.id,
        pass: record.use_pass === "vip" ? "vip" : "regular",
        startsAt: event.startsAt,
        title: event.title,
      };
      return [hold];
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

/**
 * The passes a player can still choose: what the account holds, less those already
 * promised to other games — and which games those are, so the screen can say where a
 * pass went instead of simply losing it.
 *
 * The game being signed up for is left out, so sending a sign-up again never trips over
 * the pass it is already holding.
 */
export function countFreePasses(
  account: { free_entries?: number | null; vip_free_entries?: number | null },
  holds: PassHold[],
  exceptEventId?: string,
) {
  const heldFor = holds.filter((hold) => hold.eventId !== exceptEventId);
  const left = (onAccount: number | null | undefined, pass: HeldPass) =>
    Math.max(0, Number(onAccount ?? 0) - heldFor.filter((hold) => hold.pass === pass).length);

  return {
    heldFor,
    regular: left(account.free_entries, "regular"),
    vip: left(account.vip_free_entries, "vip"),
  };
}
