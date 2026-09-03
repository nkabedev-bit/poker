import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapEventRow,
  mapSignupRow,
  toEventRow,
  type EventSignup,
  type TournamentEvent,
} from "@/lib/events/types";

const EVENT_COLUMNS =
  "id, title, badge, starts_at, late_entry_until, max_players, max_vip_players, buy_in, vip_buy_in, starting_stack, venue_address, rules_text, features_text, poster_url, is_published";

export type EventSignupWithPlayer = EventSignup & {
  displayName: string | null;
  username: string | null;
};

export async function listEvents(
  supabase: SupabaseClient,
  { publishedOnly = false }: { publishedOnly?: boolean } = {},
): Promise<TournamentEvent[]> {
  let query = supabase.from("tournament_events").select(EVENT_COLUMNS).order("starts_at");
  if (publishedOnly) query = query.eq("is_published", true);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => mapEventRow(row as Record<string, unknown>));
}

export async function getEvent(
  supabase: SupabaseClient,
  id: string,
): Promise<TournamentEvent | null> {
  const { data, error } = await supabase
    .from("tournament_events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapEventRow(data as Record<string, unknown>) : null;
}

export async function saveEvent(
  supabase: SupabaseClient,
  event: Omit<TournamentEvent, "id"> & { id?: string },
): Promise<TournamentEvent> {
  const row = toEventRow(event);
  const query = event.id
    ? supabase.from("tournament_events").update(row).eq("id", event.id)
    : supabase.from("tournament_events").insert(row);

  const { data, error } = await query.select(EVENT_COLUMNS).single();
  if (error) throw error;

  return mapEventRow(data as Record<string, unknown>);
}

export async function deleteEvent(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("tournament_events").delete().eq("id", id);
  if (error) throw error;
}

/** Live sign-up counts per event id — cancelled requests do not take a seat. */
export type EventSignupCount = { regular: number; total: number; vip: number };

/**
 * How many seats of each kind an event has spoken for. The two are counted apart: the
 * club opens a different number of regular and VIP seats, so a full VIP table must not
 * close the regular ones.
 */
export async function countActiveSignups(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<Map<string, EventSignupCount>> {
  const counts = new Map<string, EventSignupCount>();
  if (eventIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("event_signups")
    .select("event_id, ticket_type")
    .in("event_id", eventIds)
    .neq("status", "cancelled");

  if (error) throw error;

  for (const row of data ?? []) {
    const record = row as { event_id: unknown; ticket_type: unknown };
    const eventId = String(record.event_id);
    const taken = counts.get(eventId) ?? { regular: 0, total: 0, vip: 0 };
    const isVip = record.ticket_type === "vip";

    counts.set(eventId, {
      regular: taken.regular + (isVip ? 0 : 1),
      total: taken.total + 1,
      vip: taken.vip + (isVip ? 1 : 0),
    });
  }

  return counts;
}

export async function listEventSignups(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventSignupWithPlayer[]> {
  const { data, error } = await supabase
    .from("event_signups")
    .select("id, event_id, telegram_id, status, ticket_type, use_pass, created_at, client_bot_users(display_name, username)")
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .order("created_at");

  if (error) throw error;

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    // PostgREST returns the embedded row as an object for a to-one relation, but older
    // versions hand back a single-element array — accept both.
    const embedded = record.client_bot_users;
    const player = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | { display_name?: string | null; username?: string | null }
      | undefined;

    return {
      ...mapSignupRow(record),
      displayName: player?.display_name ?? null,
      username: player?.username ?? null,
    };
  });
}

/** A player's own sign-ups joined with the event, for the history on their profile. */
export async function getUserSignupsWithEvents(
  supabase: SupabaseClient,
  telegramId: number,
): Promise<Array<{ event: TournamentEvent; status: EventSignup["status"] }>> {
  const { data, error } = await supabase
    .from("event_signups")
    .select(`id, status, tournament_events(${EVENT_COLUMNS})`)
    .eq("telegram_id", telegramId)
    .neq("status", "cancelled");

  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const record = row as Record<string, unknown>;
    const embedded = record.tournament_events;
    const eventRow = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | Record<string, unknown>
      | undefined;

    if (!eventRow) return [];

    return [{
      event: mapEventRow(eventRow),
      status: (record.status as EventSignup["status"]) ?? "signed_up",
    }];
  });
}

export async function getUserSignups(
  supabase: SupabaseClient,
  telegramId: number,
): Promise<EventSignup[]> {
  const { data, error } = await supabase
    .from("event_signups")
    .select("id, event_id, telegram_id, status, ticket_type, use_pass, created_at")
    .eq("telegram_id", telegramId)
    .neq("status", "cancelled");

  if (error) throw error;

  return (data ?? []).map((row) => mapSignupRow(row as Record<string, unknown>));
}
