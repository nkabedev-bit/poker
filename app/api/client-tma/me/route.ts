import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import { getUserSignupsWithEvents } from "@/lib/events/store";
import { isUpcomingEvent } from "@/lib/events/types";
import { buildPlayerResultsFilter, computePlayerStats } from "@/lib/results/player-stats";

export const dynamic = "force-dynamic";

type AchievementStatsRow = {
  best_miss_streak: number | string | null;
  best_top9_streak: number | string | null;
  best_tournament_bounty: number | string | null;
  last_place_count: number | string | null;
  medals: Record<string, unknown> | null;
  top3_count: number | string | null;
  wins_count: number | string | null;
};

// The achievement counters live in columns added after the mini-app shipped. They are read
// apart from the auth query on purpose: if the migration is not applied yet the select
// fails, and the profile must still open — with those counters at zero — instead of
// locking every player out.
async function readAchievementStats(
  supabase: Awaited<ReturnType<typeof requireClientTmaAuth>>["supabase"],
  telegramId: number,
): Promise<AchievementStatsRow | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("client_bot_users")
    .select(
      "top3_count, wins_count, last_place_count, best_tournament_bounty, best_top9_streak, best_miss_streak, medals",
    )
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error) {
    console.warn("Achievement stats columns are unavailable", error.message);
    return null;
  }

  return (data as AchievementStatsRow | null) ?? null;
}

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

  const achievementStats = await readAchievementStats(auth.supabase, auth.user.telegram_id);

  const now = new Date();

  // Counted from the games themselves: correcting a result in the admin corrects the
  // profile and its achievements with it, which separate counters could never do.
  const { data: playedRows } = await auth.supabase
    .from("tournament_results")
    .select("place, knockouts")
    .or(buildPlayerResultsFilter(auth.user.telegram_id, auth.user.display_name ?? ""));

  const stats = computePlayerStats(
    (playedRows ?? []).map((row) => {
      const record = row as { knockouts: number | string | null; place: number | null };
      return { knockouts: Number(record.knockouts ?? 0), place: record.place };
    }),
  );

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
    // Games, knockouts and top-9 finishes are counted from the stored results, so an
    // admin correcting a game corrects the achievements with it. The counters below are
    // still accumulated at finish time and only start filling from the tournament that
    // follows their migration.
    stats: {
      bestMissStreak: Number(achievementStats?.best_miss_streak ?? 0),
      bestTop9Streak: Number(achievementStats?.best_top9_streak ?? 0),
      bestTournamentBounty: Number(achievementStats?.best_tournament_bounty ?? 0),
      eliminations: stats.eliminations,
      games: stats.games,
      lastPlace: Number(achievementStats?.last_place_count ?? 0),
      top9: stats.top9,
      top3: Number(achievementStats?.top3_count ?? 0),
      wins: Number(achievementStats?.wins_count ?? 0),
    },
    // One counter per tournament type the player has won; the medals screen reads it.
    medals: achievementStats?.medals ?? {},
    tablesCount,
    username: auth.user.username,
  });
}
