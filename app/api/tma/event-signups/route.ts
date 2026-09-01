import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { listEventSignups, listEvents } from "@/lib/events/store";
import { isUpcomingEvent } from "@/lib/events/types";
import { loadTournamentExtras } from "@/lib/tournament-extras";

export const dynamic = "force-dynamic";

/**
 * The sign-up list an admin works through on game day: the nearest published event
 * plus everyone who asked to play, with the ones already seated marked.
 */
export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const now = new Date();
  const published = await listEvents(auth.supabase, { publishedOnly: true });
  const event = published.find((item) => isUpcomingEvent(item, now)) ?? null;

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const signups = event ? await listEventSignups(auth.supabase, event.id) : [];
  const seatedTelegramIds = new Set(
    extras.players.map((player) => Number(player.telegramId)).filter(Boolean),
  );

  return NextResponse.json({
    event: event ? { id: event.id, startsAt: event.startsAt, title: event.title } : null,
    signups: signups.map((signup) => ({
      id: signup.id,
      name: signup.displayName ?? `id ${signup.telegramId}`,
      seated: signup.status === "seated" || seatedTelegramIds.has(signup.telegramId),
      telegramId: signup.telegramId,
      username: signup.username,
    })),
    tablesCount: Math.max(1, Number(extras.settings.tablesCount ?? 1)),
  });
}
