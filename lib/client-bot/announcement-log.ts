import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keeps a copy of what the club just told everybody, so the app can show it too.
 *
 * Never fails the broadcast it belongs to: the message has already gone out to the bot
 * by the time this runs, and losing the copy is worth less than pretending the sending
 * failed. A player who signed in on the web reads only this copy, which is why it is
 * written for every broadcast rather than only the scheduled ones.
 */
export async function recordClubAnnouncement(supabase: SupabaseClient, message: string) {
  const text = message.trim();
  if (!text) return false;

  const { error } = await supabase.from("club_announcements").insert({ message: text });

  if (error) {
    console.error("Could not keep a copy of the announcement", error);
    return false;
  }

  return true;
}
