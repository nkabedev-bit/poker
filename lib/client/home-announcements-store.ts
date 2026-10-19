import "server-only";

import { randomUUID } from "node:crypto";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  isHomeAnnouncementShown,
  type HomeAnnouncement,
  type HomeAnnouncementDraft,
  type HomeAnnouncementInput,
} from "@/lib/client/home-announcements";

const TABLE = "club_home_announcements";

type AnnouncementRow = {
  id: string;
  link_url: string | null;
  message: string;
  show_until: string | null;
};

type StoreResult = { items: HomeAnnouncementDraft[] } | { error: string };

function describeFailure(error: PostgrestError) {
  // PostgREST answers PGRST205 for a table it has never heard of, Postgres 42P01.
  if (error.code === "PGRST205" || error.code === "42P01") {
    return "Объявления ещё не включены: нужна миграция 202610190002";
  }
  return "База не ответила, попробуйте ещё раз";
}

/** Every card, the expired ones too, in the order the carousel shows them. */
export async function listHomeAnnouncements(supabase: SupabaseClient): Promise<StoreResult> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, message, link_url, show_until")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Could not read the home announcements", error);
    return { error: describeFailure(error) };
  }

  return {
    items: ((data ?? []) as AnnouncementRow[]).map((row) => ({
      id: row.id,
      linkUrl: row.link_url,
      message: row.message,
      showUntil: row.show_until,
    })),
  };
}

/**
 * The cards players see right now. The home screen is the point and the cards are a
 * garnish: an unreadable table leaves the carousel empty rather than failing the screen.
 */
export async function listShownHomeAnnouncements(
  supabase: SupabaseClient,
  now: Date,
): Promise<HomeAnnouncement[]> {
  try {
    const result = await listHomeAnnouncements(supabase);
    if ("error" in result) return [];

    return result.items
      .filter((item) => isHomeAnnouncementShown(item, now))
      .map(({ id, linkUrl, message }) => ({ id, linkUrl, message }));
  } catch (error) {
    console.error("Could not read the home announcements", error);
    return [];
  }
}

/**
 * Makes the stored list exactly the one the desk saved: cards keep their ids, take their
 * place in the list as their position, and whatever the desk removed is deleted.
 */
export async function replaceHomeAnnouncements(
  supabase: SupabaseClient,
  items: HomeAnnouncementInput[],
): Promise<StoreResult> {
  const updatedAt = new Date().toISOString();
  const rows = items.map((item, index) => ({
    id: item.id ?? randomUUID(),
    link_url: item.linkUrl,
    message: item.message,
    position: index,
    show_until: item.showUntil,
    updated_at: updatedAt,
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(rows);
    if (error) {
      console.error("Could not save the home announcements", error);
      return { error: describeFailure(error) };
    }
  }

  // Ids are uuids the store made or checked, so they are safe inside the filter.
  const keptIds = rows.map((row) => row.id);
  const removal = supabase.from(TABLE).delete();
  const { error } = keptIds.length > 0
    ? await removal.not("id", "in", `(${keptIds.join(",")})`)
    : await removal.not("id", "is", null);

  if (error) {
    console.error("Could not remove the deleted home announcements", error);
    return { error: describeFailure(error) };
  }

  return listHomeAnnouncements(supabase);
}
