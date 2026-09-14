import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { EventInputError } from "@/lib/events/input";
import { notifyReservedOnPublish } from "@/lib/events/reservations";

/**
 * The column comes with a migration applied by hand, so a deploy can land before it
 * exists: Postgres answers a read of it with 42703, PostgREST a write with PGRST204.
 * Everything about scheduled posters then stays quiet instead of breaking the posters.
 */
function isMissingPublishColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  return (code === "42703" || code === "PGRST204") && String(message ?? "").includes("publish_at");
}

/**
 * Puts up every draft whose publication time has come, and says which ones.
 *
 * A single statement flips them, so the five-minute job and a player opening the list at
 * the same moment cannot both publish one poster: whoever comes second finds it published
 * already and gets nothing back — and nobody is told about their ticket twice.
 */
export async function publishDueEvents(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<string[]> {
  const { data, error } = await supabase
    .from("tournament_events")
    .update({ is_published: true, publish_at: null })
    .eq("is_published", false)
    .lte("publish_at", now.toISOString())
    .select("id");

  if (error) {
    if (isMissingPublishColumn(error)) return [];
    throw error;
  }

  return (data ?? []).map((row) => String((row as { id: unknown }).id));
}

/**
 * Tells the players holding a ticket on these posters that it is waiting for them — what
 * pressing «Показать» does, for a poster that went up on its own. One failed message does
 * not keep the others from going out.
 */
export async function announcePublishedEvents(supabase: SupabaseClient, eventIds: string[]) {
  for (const eventId of eventIds) {
    try {
      await notifyReservedOnPublish(supabase, eventId);
    } catch (error) {
      console.error("Could not announce a poster that went up on schedule", error);
    }
  }
}

/** When each of these drafts is due to go up by itself, for the ones that are. */
export async function loadPublishTimes(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<Map<string, string>> {
  const times = new Map<string, string>();
  if (eventIds.length === 0) return times;

  const { data, error } = await supabase
    .from("tournament_events")
    .select("id, publish_at")
    .in("id", eventIds)
    .not("publish_at", "is", null);

  if (error) {
    if (isMissingPublishColumn(error)) return times;
    throw error;
  }

  for (const row of data ?? []) {
    const record = row as { id: unknown; publish_at: unknown };
    if (typeof record.publish_at === "string") times.set(String(record.id), record.publish_at);
  }

  return times;
}

/**
 * Sets the time a draft goes up by itself, or clears it.
 *
 * Clearing is safe to ask for before the column exists — there is nothing to clear. Setting
 * a time without it is the admin's to hear about: the poster itself is saved, but it will
 * not go up on its own.
 */
export async function savePublishAt(
  supabase: SupabaseClient,
  eventId: string,
  publishAt: string | null,
) {
  const { error } = await supabase
    .from("tournament_events")
    .update({ publish_at: publishAt })
    .eq("id", eventId);

  if (!error) return;
  if (!isMissingPublishColumn(error)) throw error;
  if (publishAt === null) return;

  throw new EventInputError(
    "Афиша сохранена, но время публикации заработает после SQL-миграции 202609140003 — выполните её в Supabase.",
  );
}
