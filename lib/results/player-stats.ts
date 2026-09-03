export type PlayerResultRow = {
  knockouts: number;
  place: number | null;
  startedAt: string;
};

export type ComputedPlayerStats = {
  bestMissStreak: number;
  bestTop9Streak: number;
  bestTournamentBounty: number;
  eliminations: number;
  games: number;
  top3: number;
  top9: number;
  wins: number;
};

const TOP_PLACES = 9;
const PODIUM_PLACES = 3;

/**
 * PostgREST `or` filter matching a player's results.
 *
 * Games are matched by account and by the club nickname both: an evening where the
 * admin added someone by hand before the nickname was linked still belongs to them,
 * and so does everything imported from the club's old sheets, which knows names only.
 */
export function buildPlayerResultsFilter(telegramId: number, nickname: string) {
  const filters = [`telegram_id.eq.${telegramId}`];
  const trimmed = nickname.trim();

  if (trimmed) filters.push(`player_name.ilike.${trimmed.replace(/[\\%_]/g, "\\$&")}`);

  return filters.join(",");
}

function isTop9(place: number | null) {
  return place !== null && place >= 1 && place <= TOP_PLACES;
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
  let top9Streak = 0;
  let missStreak = 0;

  for (const row of played) {
    // Nights restored from the club's old monthly tables have a score but no finishing
    // place. They count as games played, and they break no streak: nobody knows whether
    // that evening was a deep run or an early exit.
    if (row.place === null) continue;

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
    eliminations: Number(
      played.reduce((total, row) => total + Math.max(0, row.knockouts), 0).toFixed(2),
    ),
    games: played.length,
    top3: played.filter((row) => row.place !== null && row.place >= 1 && row.place <= PODIUM_PLACES)
      .length,
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
