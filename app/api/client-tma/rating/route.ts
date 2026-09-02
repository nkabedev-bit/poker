import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import {
  buildMonthlyStandings,
  formatMonthLabel,
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

  // Archived periods come first: the club's first two seasons ran across two months
  // each, so they are periods in their own right, and the months they cover are hidden
  // from the picker rather than offered as a second view of the same games.
  const { data: archivedPeriods } = await auth.supabase
    .from("monthly_rating_archive")
    .select("month, label, covered_months, sort_key");

  type Period = { covered: string[]; key: string; label: string; sort: string };

  const isMonthKey = (key: string) => /^\d{4}-\d{2}$/.test(key);

  const archivedPeriodsList: Period[] = (archivedPeriods ?? []).map((row) => {
    const record = row as {
      covered_months: string[] | null;
      label: string | null;
      month: string;
      sort_key: string | null;
    };

    const covered = record.covered_months?.length ? record.covered_months : [record.month];

    return {
      covered,
      key: record.month,
      // A sheet keeps the name the club gave it ("Summer Series Июнь"); only a period
      // with no stored title falls back to the calendar name.
      label: record.label?.trim() || formatMonthLabel(record.month),
      sort: record.sort_key ?? covered[0] ?? record.month,
    };
  });

  // Deduplicate: the same period is stored once per player.
  const uniquePeriods = new Map<string, Period>();
  for (const period of archivedPeriodsList) uniquePeriods.set(period.key, period);

  // A season spans months, and those months must not also appear on their own — neither
  // as leftovers of an earlier import nor as calendar entries. Both are the same games.
  const seasons = [...uniquePeriods.values()].filter((period) => !isMonthKey(period.key));
  const monthsInsideSeasons = new Set(seasons.flatMap((season) => season.covered));

  const archivedPeriodsToOffer = [...uniquePeriods.values()].filter(
    (period) => !isMonthKey(period.key) || !monthsInsideSeasons.has(period.key),
  );
  const coveredMonths = new Set(archivedPeriodsToOffer.flatMap((period) => period.covered));

  const periods: Period[] = [
    ...archivedPeriodsToOffer,
    ...listRecentMonths(now)
      .filter((key) => !coveredMonths.has(key) && !monthsInsideSeasons.has(key))
      .map((key) => ({ covered: [key], key, label: formatMonthLabel(key), sort: key })),
  ].sort((a, b) => b.sort.localeCompare(a.sort));

  const periodByKey = new Map(periods.map((period) => [period.key, period]));
  const months = periods.map((period) => period.key);
  const requested = new URL(request.url).searchParams.get("month");
  const month = requested && periodByKey.has(requested) ? requested : (months[0] ?? "");
  const selected = periodByKey.get(month);
  const archivedRow = uniquePeriods.get(month);
  const coveredBySelected = selected?.covered?.length ? [...selected.covered].sort() : [month];
  const from = getMonthRange(coveredBySelected[0]).from;
  const to = getMonthRange(coveredBySelected[coveredBySelected.length - 1]).to;

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

  // A season is served from the club's own table: it is a period the app never scored
  // itself. A month falls back to the archive only when there are no games to count.
  const useArchive = Boolean(archivedRow) && (!isMonthKey(month) || rows.length === 0);

  if (useArchive) {
    const { data: archived } = await auth.supabase
      .from("monthly_rating_archive")
      .select("player_name, points, knockouts")
      .eq("month", month)
      .order("points", { ascending: false });

    if (archived && archived.length > 0) {
      const players = archived.map((row, index) => {
        const record = row as {
          knockouts: number | string | null;
          player_name: string;
          points: number | string | null;
        };
        const isMe =
          record.player_name.trim().toLocaleLowerCase("ru-RU") ===
          (auth.user.display_name ?? "").trim().toLocaleLowerCase("ru-RU");

        return {
          avatarUrl: isMe ? (auth.user.avatar_url ?? null) : null,
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
        me: players.find((player) => player.isMe) ?? {
          avatarUrl: auth.user.avatar_url ?? null,
          eliminations: 0,
          games: 0,
          isMe: true,
          name: auth.user.display_name ?? "",
          place: null,
          points: null,
          top9: 0,
        },
        month,
        months,
        players,
        pointsAvailable: true,
      });
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
    archived: false,
    countedGames: MONTHLY_COUNTED_GAMES,
    me,
    month,
    months,
    periods: periods.map((period) => ({ key: period.key, label: period.label })),
    players,
    pointsAvailable: true,
  });
}
