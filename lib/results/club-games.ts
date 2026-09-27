import type { SupabaseClient } from "@supabase/supabase-js";

/** The past tab starts its history with September 2026 — the owner's call. */
export const PAST_GAMES_SINCE = "2026-09-01T00:00:00+03:00";

/** Results read at once: about twenty evenings of the club's size. */
export const PAST_GAMES_PAGE_ROWS = 600;

/** One player's line of a past game, as much of it as the list needs. */
export type PastGameRow = {
  eventId: string | null;
  place: number | null;
  playerName: string;
  startedAt: string;
  telegramId: number | null;
  title: string;
};

/** A past game as the list shows it. */
export type PastGame = {
  /** The poster the game was played under, when it had one. */
  eventId: string | null;
  players: number;
  startedAt: string;
  title: string;
  winner: { name: string; telegramId: number | null } | null;
};

export type PastGamesPage = {
  games: PastGame[];
  /** Where the next page starts, that game included; null when nothing is older. */
  next: string | null;
};

/**
 * The past games in one page of results, newest first.
 *
 * A page is a fixed number of rows, and a page that came back full may have cut its
 * oldest game short — so that game is left out and becomes where the next page starts.
 * A game counts every player who finished it; the winner is whoever took first place.
 */
export function groupPastGames(rows: PastGameRow[], pageFull: boolean): PastGamesPage {
  const games: PastGame[] = [];
  const byStart = new Map<string, PastGame>();

  for (const row of rows) {
    let game = byStart.get(row.startedAt);
    if (!game) {
      game = { eventId: null, players: 0, startedAt: row.startedAt, title: row.title, winner: null };
      byStart.set(row.startedAt, game);
      games.push(game);
    }

    game.players += 1;
    game.eventId ??= row.eventId;
    if (row.place === 1) game.winner = { name: row.playerName, telegramId: row.telegramId };
  }

  // A single game cannot fill a page at the club's size; were it ever to, it is shown
  // as it is rather than asked for again and again.
  if (!pageFull || games.length < 2) return { games, next: null };

  const cut = games.pop() as PastGame;
  return { games, next: cut.startedAt };
}

/**
 * One page of the club's past games since September, newest first, starting with the
 * game `from` names (or the newest, without it). A game appears once it has finished:
 * the results are written at the finish.
 */
export async function readPastGames(
  supabase: SupabaseClient,
  { from }: { from?: string | null } = {},
): Promise<PastGamesPage> {
  let query = supabase
    .from("tournament_results")
    .select("started_at, title, event_id, place, player_name, telegram_id")
    .gte("started_at", PAST_GAMES_SINCE);
  if (from) query = query.lte("started_at", from);

  const { data, error } = await query
    .order("started_at", { ascending: false })
    .order("place", { ascending: true, nullsFirst: false })
    .range(0, PAST_GAMES_PAGE_ROWS - 1);
  if (error) throw error;

  const rows = ((data ?? []) as Array<{
    event_id: string | null;
    place: number | null;
    player_name: string;
    started_at: string;
    telegram_id: number | null;
    title: string;
  }>).map((row) => ({
    eventId: row.event_id,
    place: row.place,
    playerName: row.player_name,
    startedAt: row.started_at,
    telegramId: row.telegram_id === null ? null : Number(row.telegram_id),
    title: row.title,
  }));

  return groupPastGames(rows, rows.length === PAST_GAMES_PAGE_ROWS);
}
