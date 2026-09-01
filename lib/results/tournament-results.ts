import { buildPtsStandingsRows, type PtsSettings } from "@/lib/pts-rating";
import type { TournamentPlayer } from "@/lib/timer/types";

export type TournamentResultRow = {
  knockouts: number;
  place: number | null;
  playerName: string;
  points: number;
  telegramId: number | null;
};

/**
 * The finishing table of one tournament, one row per player who took a place.
 *
 * Points come from the PTS standings, which only reach as far down as the scoring
 * places; everyone below still gets a row, with zero points, so a player can always
 * look up where they finished — that history is the whole point of storing this.
 */
export function buildTournamentResultRows(
  players: TournamentPlayer[],
  pts: Partial<PtsSettings>,
): TournamentResultRow[] {
  const pointsByPlace = new Map<number, number>();
  for (const row of buildPtsStandingsRows(players, pts)) {
    if (row.points !== null) pointsByPlace.set(row.place, row.points);
  }

  return players
    .filter((player) => Number.isInteger(player.finishPlace) && (player.finishPlace ?? 0) > 0)
    .sort((a, b) => (a.finishPlace ?? 0) - (b.finishPlace ?? 0))
    .map((player) => {
      const place = player.finishPlace ?? null;

      return {
        knockouts: Number((player.bountyCount || 0).toFixed(2)),
        place,
        playerName: player.name || "Без имени",
        points: place ? (pointsByPlace.get(place) ?? 0) : 0,
        telegramId: Number.isInteger(player.telegramId) ? Number(player.telegramId) : null,
      };
    });
}

export type MonthlyStanding = {
  avatarUrl: string | null;
  countedGames: number;
  games: number;
  knockouts: number;
  playerName: string;
  points: number;
  telegramId: number | null;
};

export const MONTHLY_COUNTED_GAMES = 5;

/**
 * The monthly table: a player's five best games count, so somebody who plays every
 * night cannot out-grind the field on volume alone.
 */
export function buildMonthlyStandings(
  results: Array<TournamentResultRow & { avatarUrl?: string | null }>,
  countedGames = MONTHLY_COUNTED_GAMES,
): MonthlyStanding[] {
  const byPlayer = new Map<string, Array<TournamentResultRow & { avatarUrl?: string | null }>>();

  for (const result of results) {
    // A guest without an account is tracked by name; everyone else by their account, so
    // a renamed player keeps one line in the table.
    const key = result.telegramId ? `tg:${result.telegramId}` : `name:${result.playerName.toLowerCase()}`;
    byPlayer.set(key, [...(byPlayer.get(key) ?? []), result]);
  }

  const standings = [...byPlayer.values()].map((playerResults) => {
    const best = [...playerResults].sort((a, b) => b.points - a.points).slice(0, countedGames);
    const latest = playerResults.at(-1) ?? playerResults[0];

    return {
      avatarUrl: playerResults.find((item) => item.avatarUrl)?.avatarUrl ?? null,
      countedGames: best.length,
      games: playerResults.length,
      knockouts: Number(
        playerResults.reduce((total, item) => total + item.knockouts, 0).toFixed(2),
      ),
      playerName: latest.playerName,
      points: Number(best.reduce((total, item) => total + item.points, 0).toFixed(2)),
      telegramId: latest.telegramId,
    };
  });

  return standings.sort(
    (a, b) => b.points - a.points || b.knockouts - a.knockouts || a.playerName.localeCompare(b.playerName),
  );
}

/** "2026-09" — the key the client sends and the month picker walks over. */
export function toMonthKey(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getMonthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}
