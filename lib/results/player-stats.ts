export type PlayerResultRow = {
  knockouts: number;
  place: number | null;
};

export type PlayerStats = {
  eliminations: number;
  games: number;
  top9: number;
};

const TOP_PLACES = 9;

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

/**
 * The numbers behind the profile and its achievements, counted from the games
 * themselves rather than accumulated separately — so correcting a game's results
 * corrects the achievements with it.
 */
export function computePlayerStats(rows: PlayerResultRow[]): PlayerStats {
  return {
    eliminations: Number(
      rows.reduce((total, row) => total + Math.max(0, row.knockouts), 0).toFixed(2),
    ),
    games: rows.length,
    top9: rows.filter((row) => row.place !== null && row.place >= 1 && row.place <= TOP_PLACES)
      .length,
  };
}
