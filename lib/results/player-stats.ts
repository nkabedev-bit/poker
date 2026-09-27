import { buildNicknameKey } from "@/lib/players/nickname-key";

export type PlayerResultRow = {
  knockouts: number;
  place: number | null;
  /** Re-entries bought that evening; null when the game was stored before we kept them. */
  rebuys?: number | null;
  /** How early the player sat down that evening, 1 for the first; null before we kept it. */
  seatOrder?: number | null;
  startedAt: string;
};

export type ComputedPlayerStats = {
  // Longest run of the club's tournaments the player came to without missing one.
  bestAttendanceStreak: number;
  // Most final tables inside any seven days.
  bestFinalsInWeek: number;
  bestMissStreak: number;
  bestTop9Streak: number;
  bestTournamentBounty: number;
  // Longest run of wins in the player's own games.
  bestWinStreak: number;
  // Podium finishes taken on the first bullet, without buying a re-entry.
  cleanPodiums: number;
  // Wins taken on the first bullet, without buying a re-entry.
  cleanWins: number;
  // Wins that ended a run of three or more tournaments outside the final table.
  comebackWins: number;
  eliminations: number;
  // Evenings the player sat down before anybody else.
  firstSeated: number;
  games: number;
  // Evenings with a knockout to the player's name — a shared one included.
  knockoutGames: number;
  // How many of first, second and third place the player has ever taken.
  podiumPlaces: number;
  // Wins that took a re-entry to get there.
  reentryWins: number;
  top3: number;
  top9: number;
  wins: number;
};

/** The games the whole club has played, which a run of attendance is read against. */
export type ClubGamesContext = { clubGames?: readonly string[] };

const TOP_PLACES = 9;
const PODIUM_PLACES = 3;
/** How long the bad run has to be before winning counts as coming back from it. */
const COMEBACK_MISSES = 3;
/** "Два финала за неделю": any seven days, not a calendar week. */
const WEEK_MS = 7 * 24 * 60 * 60_000;

/**
 * PostgREST `or` filter matching a player's results.
 *
 * Games are matched by account and by the club nickname both: an evening where the
 * admin added someone by hand before the nickname was linked still belongs to them,
 * and so does everything imported from the club's old sheets, which knows names only.
 *
 * The nickname is matched by its key, so "Kabedev", "kabedev" and "KABE_DEV" all find
 * the same player's games.
 */
/**
 * How a stored result is recognised as this player's: by the Telegram id written on it,
 * or by their club nickname. A player who signed in on the web has no Telegram id, and
 * the nickname carries them on its own — which is also what matches the games they
 * played before they ever opened the app.
 */
export function buildPlayerResultsFilter(telegramId: number | null, nickname: string) {
  const filters = telegramId === null ? [] : [`telegram_id.eq.${telegramId}`];
  const key = buildNicknameKey(nickname);

  if (key) filters.push(`player_key.eq.${key}`);

  // An account with neither owns no results. Matching on an id no row can hold says so
  // without the caller having to check first.
  return filters.length > 0 ? filters.join(",") : "telegram_id.eq.0";
}

function isTop9(place: number | null) {
  return place !== null && place >= 1 && place <= TOP_PLACES;
}

function isPodium(place: number | null) {
  return place !== null && place >= 1 && place <= PODIUM_PLACES;
}

/** When a game started, as a number, so the same moment written two ways still matches. */
function timeOf(startedAt: string) {
  return new Date(startedAt).getTime();
}

/**
 * The longest run of the club's tournaments the player came to, one after another. A
 * night the club played without them ends the run; the club's list of games is what
 * tells which nights those were, so without it there is no run to speak of.
 */
function countBestAttendanceStreak(played: PlayerResultRow[], clubGames?: readonly string[]) {
  if (!clubGames || clubGames.length === 0) return 0;

  const attended = new Set(played.map((row) => timeOf(row.startedAt)));
  const club = [...new Set(clubGames.map(timeOf))].sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  for (const game of club) {
    run = attended.has(game) ? run + 1 : 0;
    best = Math.max(best, run);
  }

  return best;
}

/** The most final tables that fit inside any seven days. */
function countBestFinalsInWeek(played: PlayerResultRow[]) {
  const finals = played
    .filter((row) => isTop9(row.place))
    .map((row) => timeOf(row.startedAt))
    .sort((a, b) => a - b);

  let best = 0;
  let first = 0;
  for (let last = 0; last < finals.length; last += 1) {
    while (finals[last] - finals[first] >= WEEK_MS) first += 1;
    best = Math.max(best, last - first + 1);
  }

  return best;
}

/**
 * Everything the profile and its achievements can be told from the games themselves:
 * how many were played, how many were won, how deep the runs went and how long the
 * good and bad streaks lasted.
 *
 * Counting these here rather than accumulating them at finish time is what lets an
 * admin correct a game and have the achievements follow. The run of attendance is the
 * one count that needs the club's own list of games, since only it knows which nights
 * the player stayed home.
 */
export function computePlayerStats(
  rows: PlayerResultRow[],
  { clubGames }: ClubGamesContext = {},
): ComputedPlayerStats {
  // Streaks only mean anything in the order the games were played.
  const played = [...rows].sort((a, b) => timeOf(a.startedAt) - timeOf(b.startedAt));

  let bestTop9Streak = 0;
  let bestMissStreak = 0;
  let bestWinStreak = 0;
  let comebackWins = 0;
  let top9Streak = 0;
  let missStreak = 0;
  let winStreak = 0;

  for (const row of played) {
    // Nights restored from the club's old monthly tables have a score but no finishing
    // place. They count as games played, and they break no streak: nobody knows whether
    // that evening was a deep run or an early exit.
    if (row.place === null) continue;

    // Read before the streaks move on: what makes this a comeback is the run of misses
    // that came before it, and winning is itself a final table that ends that run.
    if (row.place === 1 && missStreak >= COMEBACK_MISSES) comebackWins += 1;

    if (isTop9(row.place)) {
      top9Streak += 1;
      missStreak = 0;
    } else {
      missStreak += 1;
      top9Streak = 0;
    }
    winStreak = row.place === 1 ? winStreak + 1 : 0;

    bestTop9Streak = Math.max(bestTop9Streak, top9Streak);
    bestMissStreak = Math.max(bestMissStreak, missStreak);
    bestWinStreak = Math.max(bestWinStreak, winStreak);
  }

  const wins = played.filter((row) => row.place === 1);

  return {
    bestAttendanceStreak: countBestAttendanceStreak(played, clubGames),
    bestFinalsInWeek: countBestFinalsInWeek(played),
    bestMissStreak,
    bestTop9Streak,
    bestTournamentBounty: played.reduce(
      (best, row) => Math.max(best, Math.max(0, row.knockouts)),
      0,
    ),
    bestWinStreak,
    // A row that knows nothing about re-entries earns nothing: the club would rather
    // withhold the badge than hand it out on an evening it cannot vouch for.
    cleanPodiums: played.filter((row) => isPodium(row.place) && row.rebuys === 0).length,
    cleanWins: wins.filter((row) => row.rebuys === 0).length,
    comebackWins,
    eliminations: Number(
      played.reduce((total, row) => total + Math.max(0, row.knockouts), 0).toFixed(2),
    ),
    firstSeated: played.filter((row) => row.seatOrder === 1).length,
    games: played.length,
    knockoutGames: played.filter((row) => row.knockouts > 0).length,
    podiumPlaces: new Set(
      played.filter((row) => isPodium(row.place)).map((row) => row.place),
    ).size,
    reentryWins: wins.filter((row) => (row.rebuys ?? 0) > 0).length,
    top3: played.filter((row) => isPodium(row.place)).length,
    top9: played.filter((row) => isTop9(row.place)).length,
    wins: wins.length,
  };
}

/**
 * How often the player was the first one out.
 *
 * A tournament's last place is simply its largest place, so the size of each field has
 * to come from the other players' rows — the player's own result cannot tell whether
 * 27th was the bottom or the middle of the table.
 */
export function countLastPlaces(
  playerRows: PlayerResultRow[],
  fieldSizeByGame: Map<string, number>,
) {
  return playerRows.filter((row) => {
    const fieldSize = fieldSizeByGame.get(row.startedAt);
    return row.place !== null && fieldSize !== undefined && row.place === fieldSize;
  }).length;
}

/** Largest place recorded in each game — that game's last place. */
export function buildFieldSizes(rows: Array<{ place: number | null; startedAt: string }>) {
  const sizes = new Map<string, number>();

  for (const row of rows) {
    if (row.place === null) continue;
    sizes.set(row.startedAt, Math.max(sizes.get(row.startedAt) ?? 0, row.place));
  }

  return sizes;
}
