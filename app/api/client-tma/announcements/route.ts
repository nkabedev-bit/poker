import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { countUnreadAnnouncements, type Announcement } from "@/lib/client/announcements";

export const dynamic = "force-dynamic";

/** Enough to scroll through a season of them without paging. */
const SHOWN = 40;

/**
 * When this player last opened the feed.
 *
 * Read apart from the sign-in query on purpose: the column arrives with migration
 * 202609050007, and asking for it there would have turned every request in the app into
 * a refusal until the migration was applied.
 */
async function readSeenAt(
  supabase: Awaited<ReturnType<typeof requireClientTmaAuth>>["supabase"],
  accountId: string,
) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("announcements_seen_at")
    .eq("id", accountId)
    .maybeSingle();

  if (error) return null;
  return (data as { announcements_seen_at: string | null } | null)?.announcements_seen_at ?? null;
}

/** Everything the club has told the room, newest first, and how much of it is new. */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("club_announcements")
    .select("id, message, created_at")
    .order("created_at", { ascending: false })
    .limit(SHOWN);

  // The feed arrived with migration 202609050007. Until it is applied the screen shows
  // an empty club rather than locking the player out of the app.
  if (error) {
    console.warn("Announcements are unavailable", error.message);
    return NextResponse.json({ announcements: [], unread: 0 });
  }

  const announcements: Announcement[] = (data ?? []).map((row) => {
    const record = row as { created_at: string; id: string; message: string };
    return { createdAt: record.created_at, id: record.id, message: record.message };
  });

  return NextResponse.json({
    announcements,
    unread: countUnreadAnnouncements(announcements, await readSeenAt(auth.supabase, auth.user.id)),
  });
}

/** Marks the feed as read up to now, which is what opening it means. */
export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const { error } = await auth.supabase
    .from("client_bot_users")
    .update({ announcements_seen_at: new Date().toISOString() })
    .eq("id", auth.user.id);

  if (error) {
    console.warn("Could not mark the announcements read", error.message);
    return NextResponse.json({ seen: false });
  }

  return NextResponse.json({ seen: true });
}
