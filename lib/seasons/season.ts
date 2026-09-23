import { buildNicknameKey } from "@/lib/players/nickname-key";

export type SeasonStatus = "open" | "closed";

export type Season = {
  countedGames: number | null;
  endsOn: string | null;
  id: string;
  /**
   * Runs beside the regular season instead of taking over from it — the APC cup
   * qualifier. It is never stamped on games: it holds every rating game played inside
   * its own dates.
   */
  parallel: boolean;
  startsOn: string;
  status: SeasonStatus;
  title: string;
};

export type SeasonResultRow = {
  knockouts: number;
  playerName: string;
  points: number;
  telegramId: number | null;
};

export type SeasonStanding = {
  games: number;
  knockouts: number;
  place: number;
  playerName: string;
  points: number;
  telegramId: number | null;
};

export function mapSeasonRow(row: Record<string, unknown>): Season {
  return {
    countedGames:
      row.counted_games === null || row.counted_games === undefined
        ? null
        : Number(row.counted_games),
    endsOn: (row.ends_on as string | null) ?? null,
    id: String(row.id),
    // Missing until migration 202609140001 is applied, which leaves every season regular.
    parallel: row.parallel === true,
    startsOn: String(row.starts_on),
    status: row.status === "closed" ? "closed" : "open",
    title: String(row.title ?? ""),
  };
}

/**
 * The standings of one season.
 *
 * `countedGames` is the season's own rule — a short season may count a player's five
 * best games, a long one eight or all of them — because counting every game in a
 * two-month season rewards turning up over playing well, and counting five in a short
 * one throws most of it away.
 *
 * `rows` come oldest first. A line is one account, named the way the account is named
 * now (`accountNames`, by Telegram id); without one it keeps the nickname of its latest
 * game. Naming it after whichever game came back last once put a stranger's name on a
 * player's line: two accounts were swapped for one evening, and the table showed the
 * other player's nickname with this one's points.
 */
export function buildSeasonStandings(
  rows: SeasonResultRow[],
  countedGames: number | null,
  accountNames: ReadonlyMap<number, string> = new Map(),
): SeasonStanding[] {
  const byPlayer = new Map<string, SeasonResultRow[]>();

  for (const row of rows) {
    // A guest without an account is tracked by name; everyone else by their account, so
    // a renamed player keeps one line in the table.
    const key = row.telegramId
      ? `tg:${row.telegramId}`
      : `name:${buildNicknameKey(row.playerName)}`;

    byPlayer.set(key, [...(byPlayer.get(key) ?? []), row]);
  }

  const standings = [...byPlayer.values()].map((playerRows) => {
    const counted =
      countedGames === null
        ? playerRows
        : [...playerRows].sort((a, b) => b.points - a.points).slice(0, countedGames);
    const latest = playerRows.at(-1) ?? playerRows[0];

    return {
      games: playerRows.length,
      knockouts: Number(
        playerRows.reduce((total, row) => total + Math.max(0, row.knockouts), 0).toFixed(2),
      ),
      place: 0,
      playerName: (latest.telegramId && accountNames.get(latest.telegramId)) || latest.playerName,
      points: Number(counted.reduce((total, row) => total + row.points, 0).toFixed(2)),
      telegramId: latest.telegramId,
    };
  });

  return standings
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.knockouts - a.knockouts ||
        a.playerName.localeCompare(b.playerName),
    )
    .map((standing, index) => ({ ...standing, place: index + 1 }));
}

/**
 * The seasons in the order the rating screen offers them. The first is the one it opens
 * on, and the home screen shows its top three.
 *
 * Seasons arrive newest first. The regular season leads all the same: a parallel season
 * starts after the season it runs beside, and by date alone it would push the club's own
 * rating off the home screen for as long as it ran.
 */
export function arrangeSeasonsForRating(seasons: Season[]): Season[] {
  const regular =
    seasons.find((season) => season.status === "open" && !season.parallel) ??
    seasons.find((season) => !season.parallel);

  if (!regular) return seasons;

  return [regular, ...seasons.filter((season) => season.id !== regular.id)];
}

/** A season covering a date, used to place imported games that predate the stamping. */
export function findSeasonForDate(seasons: Season[], playedOn: string) {
  return (
    seasons.find(
      (season) =>
        season.startsOn <= playedOn && (season.endsOn === null || playedOn <= season.endsOn),
    ) ?? null
  );
}
