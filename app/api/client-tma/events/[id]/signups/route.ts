import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { getEvent, listEventSignups, listEventWaitlist } from "@/lib/events/store";
import { buildSignupList } from "@/lib/events/signup-list";
import { loadPlayerAvatars } from "@/lib/players/avatars";
import { takesSeat } from "@/lib/events/types";

export const dynamic = "force-dynamic";

/**
 * Who has signed up for this game, by nickname and face.
 *
 * The club's own players see each other: the list is the point of a poster going up,
 * and somebody deciding whether to come wants to know who else is. Nothing here says
 * how anybody pays — only the ticket they took, which is plain at the table anyway.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const id = (await params).id;
  const event = await getEvent(auth.supabase, id);

  if (!event || !event.isPublished) {
    return NextResponse.json({ error: "not_found", message: "Турнир не найден." }, { status: 404 });
  }

  const [signups, waitlist, avatars] = await Promise.all([
    listEventSignups(auth.supabase, id),
    listEventWaitlist(auth.supabase, id),
    loadPlayerAvatars(auth.supabase),
  ]);

  const findAvatar = (player: { name: string; telegramId: number | null }) =>
    avatars.find(player).thumbUrl;

  // Everyone actually holding a chair. `listEventSignups` also carries the no-shows,
  // whose seat has already gone to somebody in the queue.
  const now = new Date();
  const seated = signups.filter((signup) => takesSeat(signup.status, null, now));

  return NextResponse.json({
    players: buildSignupList(seated, { findAvatar, myUserId: auth.user.id }),
    // The queue is shown apart: standing in it is not a ticket, and a list that mixed
    // the two would promise seats the room does not have.
    waitlist: buildSignupList(waitlist, { findAvatar, myUserId: auth.user.id }),
  });
}
