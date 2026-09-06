import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import type { EventTicketType } from "@/lib/events/types";

/** A ticket the club is holding for somebody who asked ahead. */
export type Reservation = {
  id: string;
  nickname: string;
  notified: boolean;
  ticketType: "regular" | "vip";
  userId: string;
};

export type ReserveOutcome =
  | { error: "ambiguous" | "not_found" | "taken"; reservation: null }
  | { error: null; reservation: { userId: string } };

/**
 * Holds a ticket for a resident by the nickname the club knows them under.
 *
 * Only for somebody who already has an account: a reservation is a seat with a name on
 * it, and a name the app cannot find is a seat held for nobody.
 */
export async function reserveTicket(
  supabase: SupabaseClient,
  {
    eventId,
    nickname,
    ticketType,
  }: { eventId: string; nickname: string; ticketType: "regular" | "vip" },
): Promise<ReserveOutcome> {
  const key = buildNicknameKey(nickname);
  if (!key) return { error: "not_found", reservation: null };

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("id")
    .eq("nickname_key", key)
    .limit(2);

  if (error) throw error;

  const matches = (data ?? []) as Array<{ id: string }>;
  if (matches.length === 0) return { error: "not_found", reservation: null };
  // Two residents under one nickname cannot be told apart by it, and holding a seat for
  // the wrong one is worse than holding none.
  if (matches.length > 1) return { error: "ambiguous", reservation: null };

  const userId = matches[0].id;

  // Somebody who signed up on their own already has their seat; a reservation on top
  // would be a second one.
  const { data: standing, error: standingError } = await supabase
    .from("event_signups")
    .select("status")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (standingError) throw standingError;

  const status = (standing as { status?: string } | null)?.status;
  if (status === "signed_up" || status === "seated") {
    return { error: "taken", reservation: null };
  }

  const { error: writeError } = await supabase.from("event_signups").upsert(
    {
      event_id: eventId,
      // Held, not announced: the player hears about it when the poster goes up.
      notified_at: null,
      status: "reserved",
      ticket_type: ticketType,
      use_pass: "none",
      user_id: userId,
    },
    { onConflict: "event_id,user_id" },
  );

  if (writeError) throw writeError;

  return { error: null, reservation: { userId } };
}

/** Every ticket being held for this poster, with the name the club calls each player. */
export async function listReservations(
  supabase: SupabaseClient,
  eventId: string,
): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from("event_signups")
    .select("id, user_id, ticket_type, notified_at, client_bot_users!user_id(display_name)")
    .eq("event_id", eventId)
    .eq("status", "reserved")
    .order("created_at");

  if (error) throw error;

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const embedded = record.client_bot_users;
    const account = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | { display_name?: string | null }
      | undefined;

    return {
      id: String(record.id),
      nickname: account?.display_name ?? "Без никнейма",
      notified: Boolean(record.notified_at),
      ticketType: record.ticket_type === "vip" ? "vip" : "regular",
      userId: String(record.user_id),
    };
  });
}

/** The held tickets of several posters at once, for a screen that lists them all. */
export async function listReservationsForEvents(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<Record<string, Reservation[]>> {
  if (eventIds.length === 0) return {};

  const { data, error } = await supabase
    .from("event_signups")
    .select(
      "id, event_id, user_id, ticket_type, notified_at, client_bot_users!user_id(display_name)",
    )
    .in("event_id", eventIds)
    .eq("status", "reserved")
    .order("created_at");

  if (error) throw error;

  const byEvent: Record<string, Reservation[]> = {};

  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const embedded = record.client_bot_users;
    const account = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | { display_name?: string | null }
      | undefined;
    const eventId = String(record.event_id);

    (byEvent[eventId] ??= []).push({
      id: String(record.id),
      nickname: account?.display_name ?? "Без никнейма",
      notified: Boolean(record.notified_at),
      ticketType: record.ticket_type === "vip" ? "vip" : "regular",
      userId: String(record.user_id),
    });
  }

  return byEvent;
}

/** Takes a held ticket back, freeing the seat it was keeping. */
export async function releaseReservation(
  supabase: SupabaseClient,
  { eventId, id }: { eventId: string; id: string },
) {
  const { error } = await supabase
    .from("event_signups")
    .delete()
    .eq("event_id", eventId)
    .eq("id", id)
    .eq("status", "reserved");

  if (error) throw error;
}

export function reservedTicketMessage(eventTitle: string, ticket: EventTicketType) {
  const kind = ticket === "vip" ? "VIP" : "обычный";

  return (
    `Вам был отложен ${kind} билет на «${eventTitle}» — подтвердите, пожалуйста, участие. ` +
    "Откройте приложение и нажмите «Подтвердить»."
  );
}

/**
 * Tells everyone holding a ticket that the poster is up.
 *
 * Only ever once each: `notified_at` is what stops an admin who unpublishes and
 * publishes again from sending the same news twice. A player without Telegram hears
 * nothing and finds the ticket waiting when they next open the app.
 */
export async function notifyReservedOnPublish(
  supabase: SupabaseClient,
  eventId: string,
): Promise<number> {
  const { data: event, error: eventError } = await supabase
    .from("tournament_events")
    .select("title")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) throw eventError;
  if (!event) return 0;

  const { data, error } = await supabase
    .from("event_signups")
    .select("id, user_id, ticket_type")
    .eq("event_id", eventId)
    .eq("status", "reserved")
    .is("notified_at", null);

  if (error) throw error;

  const waiting = (data ?? []) as Array<{
    id: string;
    ticket_type: string;
    user_id: string;
  }>;
  if (waiting.length === 0) return 0;

  const { notifyClientUser } = await import("@/lib/client-bot/notify");
  const title = String((event as { title?: string }).title ?? "турнир");

  for (const held of waiting) {
    await notifyClientUser(
      supabase,
      held.user_id,
      reservedTicketMessage(title, held.ticket_type === "vip" ? "vip" : "regular"),
    );
  }

  // Stamped whether or not Telegram took the message: a player with no chat is not owed
  // the same news every time the poster is republished.
  const { error: stampError } = await supabase
    .from("event_signups")
    .update({ notified_at: new Date().toISOString() })
    .in("id", waiting.map((held) => held.id));

  if (stampError) throw stampError;

  return waiting.length;
}
