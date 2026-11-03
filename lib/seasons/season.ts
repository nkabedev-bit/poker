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

/** One line of a season's table with the games behind it, oldest first. */
export type SeasonLine<Row extends SeasonResultRow = SeasonResultRow> = {
  name: string;
  rows: Row[];
  telegramId: number | null;
};

/** What the next game can do for a player: count in any case, or beat their worst game. */
export type NextCountedGame = { kind: "any"; left: number } | { kind: "beat"; points: number };

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
 * A player's games under the season's rule, each part best first.
 *
 * `countedGames` is the season's own rule — a short season may count a player's five
 * best games, a long one eight or all of them — because counting every game in a
 * two-month season rewards turning up over playing well, and counting five in a short
 * one throws most of it away.
 *
 * The table's points and the player's list of games both come from here, so they cannot
 * disagree. Of two games with equal points on the edge, the earlier one counts: the sort
 * keeps the order the games came in, oldest first.
 */
export function splitCountedGames<Game extends { points: number }>(
  games: Game[],
  countedGames: number | null,
): { counted: Game[]; dropped: Game[] } {
  const best = [...games].sort((a, b) => b.points - a.points);
  const limit = countedGames ?? best.length;

  return { counted: best.slice(0, limit), dropped: best.slice(limit) };
}

/**
 * What a player's next game would do, from the games that count now. Nothing to say in a
 * season that counts every game.
 */
export function describeNextCountedGame(
  counted: Array<{ points: number }>,
  countedGames: number | null,
): NextCountedGame | null {
  if (countedGames === null) return null;

  const left = countedGames - counted.length;
  if (left > 0) return { kind: "any", left };

  const worst = counted.at(-1);
  return worst ? { kind: "beat", points: worst.points } : null;
}

/**
 * The lines of a season's table.
 *
 * `rows` come oldest first. A line is one account, named the way the account is named
 * now (`accountNames`, by Telegram id); without one it keeps the nickname of its latest
 * game. Naming it after whichever game came back last once put a stranger's name on a
 * player's line: two accounts were swapped for one evening, and the table showed the
 * other player's nickname with this one's points.
 *
 * A game played before the account existed joins the account by nickname, the way the
 * rest of the club matches a player. Кая played 29.09.2026 as a guest and 06.10 with her
 * new account: two lines with one name, and closing the APC qualifier failed on them.
 * A nickname two accounts share is left alone — there is no telling whose game it was.
 */
export function groupSeasonLines<Row extends SeasonResultRow>(
  rows: Row[],
  accountNames: ReadonlyMap<number, string> = new Map(),
): SeasonLine<Row>[] {
  const accountsByNickname = new Map<string, Set<number>>();
  const claimNickname = (name: string, telegramId: number) => {
    const key = buildNicknameKey(name);
    accountsByNickname.set(key, (accountsByNickname.get(key) ?? new Set()).add(telegramId));
  };
  for (const row of rows) if (row.telegramId) claimNickname(row.playerName, row.telegramId);
  for (const [telegramId, name] of accountNames) claimNickname(name, telegramId);

  const accountOf = (row: SeasonResultRow) => {
    if (row.telegramId) return row.telegramId;
    const owners = accountsByNickname.get(buildNicknameKey(row.playerName));
    return owners?.size === 1 ? [...owners][0] : null;
  };

  const byPlayer = new Map<string, { rows: Row[]; telegramId: number | null }>();

  for (const row of rows) {
    // An account keeps one line however it was named; a guest without one is tracked by name.
    const telegramId = accountOf(row);
    const key = telegramId ? `tg:${telegramId}` : `name:${buildNicknameKey(row.playerName)}`;
    const line = byPlayer.get(key) ?? { rows: [], telegramId };

    line.rows.push(row);
    byPlayer.set(key, line);
  }

  return [...byPlayer.values()].map(({ rows: playerRows, telegramId }) => {
    const latest = playerRows.at(-1) ?? playerRows[0];

    return {
      name: (telegramId && accountNames.get(telegramId)) || latest.playerName,
      rows: playerRows,
      telegramId,
    };
  });
}

/**
 * The line a row of the table stands for. A frozen table keeps the nickname of the day it
 * was frozen and a player may have changed it since, so a known account decides first,
 * then the line's name, then a nickname its games were played under.
 */
export function findSeasonLine<Row extends SeasonResultRow>(
  lines: SeasonLine<Row>[],
  player: { key: string; telegramId?: number | null },
): SeasonLine<Row> | null {
  const isNamed = (name: string) => buildNicknameKey(name) === player.key;

  return (
    (player.telegramId ? lines.find((line) => line.telegramId === player.telegramId) : undefined) ??
    lines.find((line) => isNamed(line.name)) ??
    lines.find((line) => line.rows.some((row) => isNamed(row.playerName))) ??
    null
  );
}

/** The standings of one season. */
export function buildSeasonStandings(
  rows: SeasonResultRow[],
  countedGames: number | null,
  accountNames: ReadonlyMap<number, string> = new Map(),
): SeasonStanding[] {
  const standings = groupSeasonLines(rows, accountNames).map(({ name, rows: playerRows, telegramId }) => ({
    games: playerRows.length,
    knockouts: Number(
      playerRows.reduce((total, row) => total + Math.max(0, row.knockouts), 0).toFixed(2),
    ),
    place: 0,
    playerName: name,
    points: Number(
      splitCountedGames(playerRows, countedGames)
        .counted.reduce((total, row) => total + row.points, 0)
        .toFixed(2),
    ),
    telegramId,
  }));

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

/**
 * Open seasons whose last day is behind the club. They close on their own the day after
 * (pg_cron, 12:00 Moscow time — 202610090002): the last evening runs past midnight, and
 * its results are in long before noon.
 */
export function findSeasonsDueToClose(seasons: Season[], now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(now);

  return seasons.filter(
    (season): season is Season & { endsOn: string } =>
      season.status === "open" && season.endsOn !== null && season.endsOn < today,
  );
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
