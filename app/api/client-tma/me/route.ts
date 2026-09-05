import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import { getUserSignupsWithEvents } from "@/lib/events/store";
import { isUpcomingEvent } from "@/lib/events/types";
import { getPersistedPlayerLabel } from "@/lib/player-labels";
import { isSameTelegramAccount } from "@/lib/players/same-account";
import { resolvePlayerTier } from "@/lib/players/tier";
import { buildPlayerStats, readPlayerGames } from "@/lib/players/profile";

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
  accountId: string,
): Promise<AchievementStatsRow | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("client_bot_users")
    .select(
      "top3_count, wins_count, last_place_count, best_tournament_bounty, best_top9_streak, best_miss_streak, medals",
    )
    .eq("id", accountId)
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

  // Matched by account first: two web players both carry a null Telegram id, and
  // comparing those would have shown one of them the other's table and number.
  const player = context?.extras.players.find((item) =>
    item.accountId
      ? item.accountId === auth.user.id
      : isSameTelegramAccount(auth.user.telegram_id, item.telegramId),
  );

  const achievementStats = await readAchievementStats(auth.supabase, auth.user.id);

  const now = new Date();

  // Counted from the games themselves: correcting a result in the admin corrects the
  // profile and its achievements with it, which separate counters could never do.
  const played = await readPlayerGames(auth.supabase, {
    nickname: auth.user.display_name ?? "",
    telegramId: auth.user.telegram_id,
  });
  const { lastPlace, ...stats } = await buildPlayerStats(auth.supabase, played);

  // The club's own label wins over the count, which is how a champion is crowned.
  const tier = resolvePlayerTier({
    games: stats.games,
    label: getPersistedPlayerLabel(context?.extras.playerLabels, auth.user.display_name),
  });

  const history = await getUserSignupsWithEvents(auth.supabase, auth.user.id);
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
    // A photo the player uploaded themselves, which the profile shows over Telegram's.
    avatarIsCustom: Boolean(auth.user.avatar_is_custom),
    // Stored copy of the Telegram photo, used when the mini-app was opened without one.
    avatarUrl: auth.user.avatar_url,
    // Entries the club gave the player: one covers the ticket of a single tournament,
    // never a re-entry or an add-on.
    freeEntries: {
      regular: Number(auth.user.free_entries ?? 0),
      vip: Number(auth.user.vip_free_entries ?? 0),
    },
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
    // Every counter here is derived from the stored results, so correcting a game in the
    // admin corrects the achievements with it — and games played before any of this
    // existed count too, because the club's old sheets were imported into the same table.
    stats: {
      bestMissStreak: stats.bestMissStreak,
      bestTop9Streak: stats.bestTop9Streak,
      bestTournamentBounty: stats.bestTournamentBounty,
      eliminations: stats.eliminations,
      games: stats.games,
      lastPlace,
      top9: stats.top9,
      top3: stats.top3,
      wins: stats.wins,
    },
    // One counter per tournament type the player has won; the medals screen reads it.
    medals: achievementStats?.medals ?? {},
    tier,
    tablesCount,
    username: auth.user.username,
  });
}
