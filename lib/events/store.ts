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
  "id, title, badge, starts_at, late_entry_until, max_players, buy_in, starting_stack, venue_address, rules_text, features_text, poster_url, is_published";

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
export async function countActiveSignups(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (eventIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("event_signups")
    .select("event_id")
    .in("event_id", eventIds)
    .neq("status", "cancelled");

  if (error) throw error;

  for (const row of data ?? []) {
    const eventId = String((row as { event_id: unknown }).event_id);
    counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
  }

  return counts;
}

export async function listEventSignups(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventSignupWithPlayer[]> {
  const { data, error } = await supabase
    .from("event_signups")
    .select("id, event_id, telegram_id, status, created_at, client_bot_users(display_name, username)")
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

export async function getUserSignups(
  supabase: SupabaseClient,
  telegramId: number,
): Promise<EventSignup[]> {
  const { data, error } = await supabase
    .from("event_signups")
    .select("id, event_id, telegram_id, status, created_at")
    .eq("telegram_id", telegramId)
    .neq("status", "cancelled");

  if (error) throw error;

  return (data ?? []).map((row) => mapSignupRow(row as Record<string, unknown>));
}
