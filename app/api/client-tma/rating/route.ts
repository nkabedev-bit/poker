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

function normalizeNickname(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

/**
 * The club standings for one month.
 *
 * An imported month wins over anything computed here: those totals are what the club
 * announced to its players, and they cannot be reproduced from the game sheets — the
 * PTS column deliberately leaves knockout points out in the side-points modes, so a
 * recount would quietly disagree with the published table.
 *
 * Months played since the app started keeping results are computed from them, counting
 * each player's best games.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const now = new Date();
  const months = listRecentMonths(now);
  const requested = new URL(request.url).searchParams.get("month");
  const month = requested && months.includes(requested) ? requested : months[0];
  const { from, to } = getMonthRange(month);

  const myNickname = normalizeNickname(auth.user.display_name);
  const emptyMe = {
    avatarUrl: auth.user.avatar_url ?? null,
    eliminations: 0,
    games: 0,
    isMe: true,
    name: auth.user.display_name ?? "",
    place: null as number | null,
    points: null as number | null,
    top9: 0,
  };

  const { data: archived } = await auth.supabase
    .from("monthly_rating_archive")
    .select("player_name, points, knockouts")
    .eq("month", month)
    .order("points", { ascending: false });

  if (archived && archived.length > 0) {
    // Faces come from the accounts, matched on the nickname the club wrote in the sheet.
    const { data: users } = await auth.supabase
      .from("client_bot_users")
      .select("display_name, avatar_url")
      .not("display_name", "is", null);

    const avatarByNickname = new Map<string, string | null>();
    for (const user of users ?? []) {
      const record = user as { avatar_url: string | null; display_name: string | null };
      const nickname = normalizeNickname(record.display_name);
      if (nickname) avatarByNickname.set(nickname, record.avatar_url);
    }

    const players = archived.map((row, index) => {
      const record = row as {
        knockouts: number | string | null;
        player_name: string;
        points: number | string | null;
      };
      const nickname = normalizeNickname(record.player_name);
      const isMe = Boolean(myNickname) && nickname === myNickname;

      return {
        avatarUrl: isMe ? (auth.user.avatar_url ?? null) : (avatarByNickname.get(nickname) ?? null),
        eliminations: Math.round(Number(record.knockouts ?? 0)),
        games: 0,
        isMe,
        name: record.player_name,
        place: index + 1,
        points: Number(record.points ?? 0),
        top9: 0,
      };
    });

    return NextResponse.json({
      archived: true,
      countedGames: MONTHLY_COUNTED_GAMES,
      me: players.find((player) => player.isMe) ?? emptyMe,
      month,
      months,
      players,
      pointsAvailable: true,
    });
  }

  const { data, error } = await auth.supabase
    .from("tournament_results")
    .select("telegram_id, player_name, place, points, knockouts")
    .eq("counts_for_rating", true)
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

  return NextResponse.json({
    archived: false,
    countedGames: MONTHLY_COUNTED_GAMES,
    me: players.find((player) => player.isMe) ?? emptyMe,
    month,
    months,
    players,
    pointsAvailable: true,
  });
}
