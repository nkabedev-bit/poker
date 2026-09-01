import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import {
  buildMonthlyStandings,
  getMonthRange,
  MONTHLY_COUNTED_GAMES,
  toMonthKey,
} from "@/lib/results/tournament-results";

export const dynamic = "force-dynamic";

const MONTHS_OFFERED = 12;

function listRecentMonths(now: Date) {
  return Array.from({ length: MONTHS_OFFERED }, (_, index) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return toMonthKey(month);
  });
}

/**
 * The club standings for one month, counting each player's best games.
 *
 * Everything is read from the results the app stores when a tournament finishes, so a
 * new month needs no setup: the rows carry their own date and the month is a filter.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const now = new Date();
  const months = listRecentMonths(now);
  const requested = new URL(request.url).searchParams.get("month");
  const month = requested && months.includes(requested) ? requested : months[0];
  const { from, to } = getMonthRange(month);

  const { data, error } = await auth.supabase
    .from("tournament_results")
    .select("telegram_id, player_name, place, points, knockouts")
    .gte("played_on", from)
    .lt("played_on", to);

  if (error) throw error;

  const rows = (data ?? []).map((row) => {
    const record = row as {
      knockouts: number | string | null;
      place: number | null;
      player_name: string;
      points: number | string | null;
      telegram_id: number | null;
    };

    return {
      knockouts: Number(record.knockouts ?? 0),
      place: record.place,
      playerName: record.player_name,
      points: Number(record.points ?? 0),
      telegramId: record.telegram_id,
    };
  });

  // Avatars come from the bot's stored copies, joined in by account.
  const telegramIds = [...new Set(rows.map((row) => row.telegramId).filter(Boolean))];
  const avatars = new Map<number, string | null>();

  if (telegramIds.length > 0) {
    const { data: users } = await auth.supabase
      .from("client_bot_users")
      .select("telegram_id, avatar_url")
      .in("telegram_id", telegramIds);

    for (const user of users ?? []) {
      const record = user as { avatar_url: string | null; telegram_id: number };
      avatars.set(record.telegram_id, record.avatar_url);
    }
  }

  const standings = buildMonthlyStandings(
    rows.map((row) => ({
      ...row,
      avatarUrl: row.telegramId ? (avatars.get(row.telegramId) ?? null) : null,
    })),
  );

  const players = standings.map((standing, index) => ({
    avatarUrl: standing.avatarUrl,
    eliminations: Math.round(standing.knockouts),
    games: standing.games,
    isMe: standing.telegramId === auth.user.telegram_id,
    name: standing.playerName,
    place: index + 1,
    points: standing.points,
    top9: 0,
  }));

  const me = players.find((player) => player.isMe) ?? {
    avatarUrl: auth.user.avatar_url ?? null,
    eliminations: 0,
    games: 0,
    isMe: true,
    name: auth.user.display_name ?? "",
    place: null,
    points: null,
    top9: 0,
  };

  return NextResponse.json({
    countedGames: MONTHLY_COUNTED_GAMES,
    me,
    month,
    months,
    players,
    pointsAvailable: true,
  });
}
