import { buildNicknameKey } from "@/lib/players/nickname-key";

export type PlayerResultRow = {
  knockouts: number;
  place: number | null;
  /** Re-entries bought that evening; null when the game was stored before we kept them. */
  rebuys?: number | null;
  startedAt: string;
};

export type ComputedPlayerStats = {
  bestMissStreak: number;
  bestTop9Streak: number;
  bestTournamentBounty: number;
  // Podium finishes taken on the first bullet, without buying a re-entry.
  cleanPodiums: number;
  // Wins that ended a run of three or more tournaments outside the final table.
  comebackWins: number;
  eliminations: number;
  games: number;
  top3: number;
  top9: number;
  wins: number;
};

const TOP_PLACES = 9;
const PODIUM_PLACES = 3;
/** How long the bad run has to be before winning counts as coming back from it. */
const COMEBACK_MISSES = 3;

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

/**
 * Everything the profile and its achievements can be told from the games themselves:
 * how many were played, how many were won, how deep the runs went and how long the
 * good and bad streaks lasted.
 *
 * Counting these here rather than accumulating them at finish time is what lets an
 * admin correct a game and have the achievements follow.
 */
export function computePlayerStats(rows: PlayerResultRow[]): ComputedPlayerStats {
  // Streaks only mean anything in the order the games were played.
  const played = [...rows].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );

  let bestTop9Streak = 0;
  let bestMissStreak = 0;
  let comebackWins = 0;
  let top9Streak = 0;
  let missStreak = 0;

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

    bestTop9Streak = Math.max(bestTop9Streak, top9Streak);
    bestMissStreak = Math.max(bestMissStreak, missStreak);
  }

  return {
    bestMissStreak,
    bestTop9Streak,
    bestTournamentBounty: played.reduce(
      (best, row) => Math.max(best, Math.max(0, row.knockouts)),
      0,
    ),
    // A row that knows nothing about re-entries earns nothing: the club would rather
    // withhold the badge than hand it out on an evening it cannot vouch for.
    cleanPodiums: played.filter((row) => isPodium(row.place) && row.rebuys === 0).length,
    comebackWins,
    eliminations: Number(
      played.reduce((total, row) => total + Math.max(0, row.knockouts), 0).toFixed(2),
    ),
    games: played.length,
    top3: played.filter((row) => isPodium(row.place)).length,
    top9: played.filter((row) => isTop9(row.place)).length,
    wins: played.filter((row) => row.place === 1).length,
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
