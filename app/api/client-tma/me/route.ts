import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import { getUserSignupsWithEvents } from "@/lib/events/store";
import { isUpcomingEvent } from "@/lib/events/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const context = await loadCurrentTournamentContext(auth.supabase);
  const tablesCount = context
    ? Math.max(1, Math.floor(context.extras.settings.tablesCount))
    : 0;

  const player = context?.extras.players.find(
    (item) => item.telegramId === auth.user.telegram_id,
  );

  const now = new Date();
  const history = await getUserSignupsWithEvents(auth.supabase, auth.user.telegram_id);
  const [active, past] = history.reduce<[typeof history, typeof history]>(
    (split, item) => {
      split[isUpcomingEvent(item.event, now) ? 0 : 1].push(item);
      return split;
    },
    [[], []],
  );

  const byStartDate = (a: (typeof history)[number], b: (typeof history)[number]) =>
    new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime();

  return NextResponse.json({
    // Stored copy of the Telegram photo, used when the mini-app was opened without one.
    avatarUrl: auth.user.avatar_url,
    // The club nickname is what the player is known by at the table, so it wins over
    // whatever Telegram calls them.
    displayName: auth.user.display_name,
    history: {
      active: active.sort(byStartDate),
      past: past.sort((a, b) => byStartDate(b, a)),
    },
    profileSubmitted: Boolean(auth.user.profile_submitted_at),
    registered: player
      ? {
          registrationNumber: player.registrationNumber ?? null,
          table: player.table ?? null,
          name: player.name,
        }
      : null,
    stats: {
      eliminations: Number(auth.user.eliminations_count ?? 0),
      games: auth.user.games_played ?? 0,
      top9: auth.user.top7_count ?? 0,
    },
    tablesCount,
    username: auth.user.username,
  });
}
