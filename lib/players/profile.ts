import type { SupabaseClient } from "@supabase/supabase-js";
import { readInviteStats, type InviteStats } from "@/lib/players/invitees";
import {
  buildFieldSizes,
  buildPlayerResultsFilter,
  computePlayerStats,
  countLastPlaces,
} from "@/lib/results/player-stats";
import { countBestTopTenSeasonStreak, readClosedSeasonTopTens } from "@/lib/seasons/top-ten-streak";
import { readAllPages } from "@/lib/supabase/read-all-pages";

/** Games asked about in one request when reading their fields: keeps the query short. */
const FIELD_GAMES_PER_REQUEST = 100;

type StoredGame = {
  knockouts: number | string | null;
  place: number | null;
  rebuys?: number | string | null;
  seat_order?: number | string | null;
  started_at: string;
};

export type PlayedGame = {
  knockouts: number;
  place: number | null;
  /** Re-entries bought that evening; null when the game predates the column. */
  rebuys: number | null;
  /** How early the player sat down that evening, 1 for the first; null before it was kept. */
  seatOrder?: number | null;
  startedAt: string;
};

export type PlayerProfileStats = ReturnType<typeof computePlayerStats> &
  InviteStats & {
    // Closed seasons in a row finished in the top ten.
    bestTopTenSeasonStreak: number;
    lastPlace: number;
  };

/** Whose profile it is: the account behind it (if any) and how the results know them. */
export type ProfileOwner = { accountId: string | null; nickname: string; telegramId: number | null };

/**
 * Re-entries and the seating order were added to the table later and the club runs its
 * migrations by hand, so a profile still opens where they are missing — those games
 * simply say they do not know.
 */
const GAME_COLUMNS = "place, knockouts, started_at";
const OPTIONAL_GAME_COLUMNS = ["rebuys", "seat_order"] as const;

function readNullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

/**
 * Everything a profile says about a player, counted from the games themselves.
 *
 * The same numbers serve the player's own profile and anyone else's: correcting a
 * result in the admin corrects every profile that game appears in, which separate
 * counters could never do.
 */
export async function readPlayerGames(
  supabase: SupabaseClient,
  { nickname, telegramId }: { nickname: string; telegramId: number | null },
): Promise<PlayedGame[]> {
  // Every game, however many: the achievements count them all, and a request is cut at a
  // thousand rows without a word.
  const read = (columns: string) =>
    readAllPages<StoredGame>((from, to) =>
      supabase
        .from("tournament_results")
        .select(columns)
        .or(buildPlayerResultsFilter(telegramId ?? null, nickname))
        .order("started_at", { ascending: false })
        .order("id")
        .range(from, to),
    );

  // A column the database says is missing is left out and the read asked again; anything
  // else leaves the profile empty rather than locked.
  let optional: string[] = [...OPTIONAL_GAME_COLUMNS];
  let games: StoredGame[] = [];
  for (;;) {
    try {
      games = await read([GAME_COLUMNS, ...optional].join(", "));
      break;
    } catch (error) {
      const message = String((error as { message?: unknown })?.message ?? "");
      const missing = optional.find((column) => message.includes(column));
      if (!missing) {
        console.error("Failed to read the player's games", error);
        return [];
      }

      console.warn(`tournament_results.${missing} is missing; reading games without it`);
      optional = optional.filter((column) => column !== missing);
    }
  }

  return games.map((record) => ({
    knockouts: Number(record.knockouts ?? 0),
    place: record.place,
    rebuys: readNullableNumber(record.rebuys),
    seatOrder: readNullableNumber(record.seat_order),
    startedAt: record.started_at,
  }));
}

/**
 * The size of the field in each of these games — the largest place anyone took — read
 * from everybody's rows. A regular's games hold thousands of them, so they are read in
 * batches of games and pages of rows until none is left out.
 */
async function readFieldSizes(supabase: SupabaseClient, startedAt: string[]) {
  const games = [...new Set(startedAt)];
  const rows: Array<{ place: number | null; startedAt: string }> = [];

  for (let offset = 0; offset < games.length; offset += FIELD_GAMES_PER_REQUEST) {
    const batch = games.slice(offset, offset + FIELD_GAMES_PER_REQUEST);
    const page = await readAllPages<{ place: number | null; started_at: string }>((from, to) =>
      supabase
        .from("tournament_results")
        .select("place, started_at")
        .in("started_at", batch)
        .not("place", "is", null)
        .order("id")
        .range(from, to),
    );

    rows.push(...page.map((row) => ({ place: row.place, startedAt: row.started_at })));
  }

  return buildFieldSizes(rows);
}

/**
 * The club's games, oldest first: the list a run of attendance is read against. Read
 * through a small database function that answers one row per game; until its migration
 * is applied, and whenever the read fails, the run simply stays at nought.
 */
async function readClubGames(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("list_club_games");
    if (error) throw error;

    return ((data ?? []) as Array<{ started_at: string }>).map((row) => row.started_at);
  } catch (error) {
    console.warn("The club's list of games is unavailable for the achievements", error);
    return [];
  }
}

/**
 * Everything a profile counts. Most of it comes from the player's own games; a run of
 * attendance needs the club's list of games, a run in the top ten needs the closed
 * seasons, and the invites need the players the account brought in — each read apart,
 * and each left at nought when it cannot be.
 */
export async function buildPlayerStats(
  supabase: SupabaseClient,
  played: PlayedGame[],
  owner?: ProfileOwner,
): Promise<PlayerProfileStats> {
  const [clubGames, seasons, invites] = await Promise.all([
    played.length > 0 ? readClubGames(supabase) : Promise.resolve([]),
    owner ? readClosedSeasonTopTens(supabase) : Promise.resolve([]),
    readInviteStats(supabase, owner?.accountId ?? null),
  ]);
  const stats = computePlayerStats(played, { clubGames });
  const bestTopTenSeasonStreak = owner
    ? countBestTopTenSeasonStreak(seasons, { nickname: owner.nickname, telegramId: owner.telegramId })
    : 0;

  // "Last place" needs the size of each field, which only the other players' rows can
  // tell — 27th is the bottom of one tournament and the middle of another. Without the
  // whole field there is no telling, and the count waits rather than guesses.
  let lastPlace = 0;
  if (played.length > 0) {
    try {
      const fieldSizes = await readFieldSizes(
        supabase,
        played.map((row) => row.startedAt),
      );
      lastPlace = countLastPlaces(played, fieldSizes);
    } catch (error) {
      console.error("Failed to read the fields of the player's games", error);
    }
  }

  return { ...stats, ...invites, bestTopTenSeasonStreak, lastPlace };
}
