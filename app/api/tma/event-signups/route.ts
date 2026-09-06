import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { listEventSignups, listEvents } from "@/lib/events/store";
import { isEventOpenForSeating } from "@/lib/events/types";
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
  // Not "still open for sign-ups": the desk works the whole day of the game, seating
  // everyone who asked in time — including whoever walks in hours after the start.
  const event = published.find((item) => isEventOpenForSeating(item, now)) ?? null;

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const signups = event ? await listEventSignups(auth.supabase, event.id) : [];
  const seatedTelegramIds = new Set(
    extras.players.map((player) => Number(player.telegramId)).filter(Boolean),
  );
  // A player who joined through the web is at the table under their account and no
  // Telegram id at all, so that is what the roster is matched on.
  const seatedAccountIds = new Set(
    extras.players.map((player) => player.accountId).filter((id): id is string => Boolean(id)),
  );

  return NextResponse.json({
    event: event ? { id: event.id, startsAt: event.startsAt, title: event.title } : null,
    signups: signups.map((signup) => ({
      id: signup.id,
      name: signup.displayName ?? "Без никнейма",
      // Who the player is bringing on a "1+1", so the desk expects two of them.
      partnerName: signup.duoPartnerName,
      seated:
        signup.status === "seated" ||
        seatedAccountIds.has(signup.userId) ||
        (signup.telegramId !== null && seatedTelegramIds.has(signup.telegramId)),
      telegramId: signup.telegramId,
      // The ticket the player asked for, so the desk starts from their choice.
      ticketType: signup.ticketType,
      // What the player chose to pay with, so the desk knows before handing the card.
      usePass: signup.usePass,
      // The account is who this is: a web player has no Telegram id to be found by.
      userId: signup.userId,
      username: signup.username,
    })),
    tablesCount: Math.max(1, Number(extras.settings.tablesCount ?? 1)),
  });
}
