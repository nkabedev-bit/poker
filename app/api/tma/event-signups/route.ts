import { NextResponse } from "next/server";
import {
  countActiveSignups,
  listEventSignups,
  listEventWaitlist,
  listEvents,
} from "@/lib/events/store";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { isEventOpenForSeating, isEventPlayingToday } from "@/lib/events/types";
import { loadTournamentExtras } from "@/lib/tournament-extras";

export const dynamic = "force-dynamic";

/**
 * The sign-up list an admin works through on game day, and the evenings around it.
 *
 * The club posts a week at a time, so the desk is asked about more than tonight: who is
 * coming on Thursday, whether Sunday is filling up. Every published evening still ahead
 * is offered, the nearest opens by default, and only the one being played can be seated
 * from — a Thursday player dropped into tonight's tournament sits at a table nobody
 * expects them at.
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
  const open = published.filter((item) => isEventOpenForSeating(item, now));
  const asked = new URL(request.url).searchParams.get("eventId");
  const event = open.find((item) => item.id === asked) ?? open[0] ?? null;
  const seatingOpen = event ? isEventPlayingToday(event, now) : false;

  const [extras, signups, waitlist, counts] = await Promise.all([
    loadTournamentExtras(t.id, auth.supabase),
    event ? listEventSignups(auth.supabase, event.id) : [],
    // The queue is read alongside the sign-ups: when somebody does not turn up, the
    // desk gives their place to the next player in line rather than leaving a chair
    // empty at a sold-out table.
    event ? listEventWaitlist(auth.supabase, event.id) : [],
    countActiveSignups(
      auth.supabase,
      open.map((item) => item.id),
    ),
  ]);

  // The roster is tonight's and says nothing about Thursday: without this, a player at
  // the table now would show as seated on every evening they are signed up for.
  const seatedTelegramIds = new Set(
    seatingOpen ? extras.players.map((player) => Number(player.telegramId)).filter(Boolean) : [],
  );
  // A player who joined through the web is at the table under their account and no
  // Telegram id at all, so that is what the roster is matched on.
  const seatedAccountIds = new Set(
    seatingOpen
      ? extras.players.map((player) => player.accountId).filter((id): id is string => Boolean(id))
      : [],
  );

  return NextResponse.json({
    event: event
      ? { id: event.id, seatingOpen, startsAt: event.startsAt, title: event.title }
      : null,
    // Every evening the desk may be asked about, nearest first.
    events: open.map((item) => ({
      id: item.id,
      signupsCount: counts.get(item.id)?.total ?? 0,
      startsAt: item.startsAt,
      title: item.title,
    })),
    signups: signups.map((signup) => ({
      id: signup.id,
      name: signup.displayName ?? "Без никнейма",
      // They never came and their place went to the queue. Kept on the list so the desk
      // can say what happened if they turn up late.
      noShow: signup.status === "no_show",
      // Who the player is bringing on a "1+1", so the desk expects two of them.
      partnerName: signup.duoPartnerName,
      // A ticket the admin put aside and the player has yet to answer. It holds a seat,
      // so the desk expects them — but nobody has said they are coming.
      reserved: signup.status === "reserved",
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
    // The plan is drawn with the chairs the club has at each table, not a fixed ten.
    seatsPerTable: Math.max(1, Number(extras.settings.maxPlayersPerTable ?? 1)),
    tablesCount: Math.max(1, Number(extras.settings.tablesCount ?? 1)),
    // Standing in line, in the order it formed. A place in the queue is not a ticket:
    // the desk seats one of these only in somebody else's stead.
    waitlist: waitlist.map((entry) => ({
      id: entry.id,
      name: entry.displayName ?? "Без никнейма",
      telegramId: entry.telegramId,
      ticketType: entry.ticketType,
      userId: entry.userId,
      username: entry.username,
    })),
  });
}
