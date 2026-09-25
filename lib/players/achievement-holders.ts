import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_PLAYER_STATS, getAchievements } from "@/lib/client/achievements";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import {
  buildFieldSizes,
  computePlayerStats,
  countLastPlaces,
  type PlayerResultRow,
} from "@/lib/results/player-stats";
import { readAllPages } from "@/lib/supabase/read-all-pages";

/**
 * How long one reading of the whole club stands in for a fresh one.
 *
 * Counting everyone's achievements reads every result the club has stored — thousands of
 * rows — and the answer moves only when a game is played or corrected. A finished game is
 * noticed at once by the row count; an hour is how long a correction made in the admin
 * may take to show. The owner asked to spare the monthly limits over being to the minute.
 */
const CACHE_TTL_MS = 60 * 60_000;

const RESULT_COLUMNS = "telegram_id, player_key, player_name, place, knockouts, started_at";

export type ClubResultRow = PlayerResultRow & {
  playerKey: string;
  playerName: string;
  telegramId: number | null;
};

export type ClubAccount = {
  /** The thumbnail where there is one: holders are drawn as a list. */
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  /** Null on an account that signed in on the web; its nickname finds its games. */
  telegramId: number | null;
};

export type AchievementHolder = {
  /** Null for a player the club only knows by nickname. Never leaves the server. */
  accountId: string | null;
  avatarUrl: string | null;
  /** Nickname key: the address of the player's profile. */
  key: string;
  name: string;
  /** How far the player went: games played, wins, the best night's knockouts… */
  value: number;
};

export type ClubAchievements = {
  /** Who holds each achievement, the furthest along first. Every achievement is listed. */
  holders: Record<string, AchievementHolder[]>;
  /** Everyone with at least one game behind them — what the rarity is a share of. */
  players: number;
};

type ClubPlayer = Omit<AchievementHolder, "value"> & { rows: ClubResultRow[] };

type RawResult = {
  knockouts: number | string | null;
  place: number | null;
  player_key: string | null;
  player_name: string;
  rebuys?: number | string | null;
  started_at: string;
  telegram_id: number | string | null;
};

type RawAccount = {
  avatar_thumb_url: string | null;
  avatar_url: string | null;
  display_name: string | null;
  id: string;
  telegram_id: number | string | null;
};

function addTo<Key>(map: Map<Key, ClubResultRow[]>, key: Key, row: ClubResultRow) {
  const rows = map.get(key);
  if (rows) rows.push(row);
  else map.set(key, [row]);
}

/**
 * Every player of the club with the achievements their profile shows them.
 *
 * A player is found the way their profile finds its games (`buildPlayerResultsFilter`):
 * an account owns every result under its Telegram id and every result under its
 * nickname, so a player who renamed themselves is still one player. Results no account
 * answers to — players typed in at the desk, the club's old sheets — belong to their
 * nickname, which is how such a player's profile reads them. Counting the same way is
 * what keeps a player's own screen and the list of holders from disagreeing.
 */
export function buildClubAchievements(
  results: ClubResultRow[],
  accounts: ClubAccount[],
): ClubAchievements {
  const byTelegramId = new Map<number, ClubResultRow[]>();
  const byNickname = new Map<string, ClubResultRow[]>();

  for (const row of results) {
    if (row.telegramId !== null && row.telegramId > 0) addTo(byTelegramId, row.telegramId, row);
    if (row.playerKey) addTo(byNickname, row.playerKey, row);
  }

  const players: ClubPlayer[] = [];
  const claimed = new Set<ClubResultRow>();

  for (const account of accounts) {
    const name = account.displayName?.trim() ?? "";
    const key = buildNicknameKey(name);
    if (!key) continue;

    const rows = new Set([
      ...(account.telegramId !== null && account.telegramId > 0
        ? (byTelegramId.get(account.telegramId) ?? [])
        : []),
      ...(byNickname.get(key) ?? []),
    ]);
    // An account that has never played is not a player yet.
    if (rows.size === 0) continue;

    for (const row of rows) claimed.add(row);
    players.push({ accountId: account.id, avatarUrl: account.avatarUrl, key, name, rows: [...rows] });
  }

  for (const [key, rows] of byNickname) {
    if (rows.every((row) => claimed.has(row))) continue;

    // Signed with the spelling of their latest game, as their profile is.
    const latest = rows.reduce((last, row) =>
      new Date(row.startedAt).getTime() > new Date(last.startedAt).getTime() ? row : last,
    );
    players.push({ accountId: null, avatarUrl: null, key, name: latest.playerName, rows });
  }

  // "Last place" is the largest place of a game, which only the whole field can tell.
  const fieldSizes = buildFieldSizes(results);
  const holders: Record<string, AchievementHolder[]> = Object.fromEntries(
    getAchievements(EMPTY_PLAYER_STATS).map((achievement) => [achievement.id, []]),
  );

  for (const { rows, ...player } of players) {
    const stats = { ...computePlayerStats(rows), lastPlace: countLastPlaces(rows, fieldSizes) };

    for (const achievement of getAchievements(stats)) {
      if (achievement.earned) holders[achievement.id].push({ ...player, value: achievement.value });
    }
  }

  for (const list of Object.values(holders)) {
    list.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ru"));
  }

  return { holders, players: players.length };
}

async function readAllResults(supabase: SupabaseClient): Promise<ClubResultRow[]> {
  // Ordered by id alone: a page boundary has to fall in the same place on every request.
  const read = (columns: string) =>
    readAllPages<RawResult>((from, to) =>
      supabase.from("tournament_results").select(columns).order("id").range(from, to),
    );

  // Re-entries were added to the table later and the club runs its migrations by hand, so
  // the count still runs where the column is missing — "Без страховки" then goes to nobody,
  // which is what the profile shows in that case too.
  let rows: RawResult[];
  try {
    rows = await read(`${RESULT_COLUMNS}, rebuys`);
  } catch (error) {
    if (!String((error as { message?: unknown })?.message ?? "").includes("rebuys")) throw error;

    console.warn("tournament_results.rebuys is missing; counting achievements without it", error);
    rows = await read(RESULT_COLUMNS);
  }

  return rows.map((row) => ({
    knockouts: Number(row.knockouts ?? 0),
    place: row.place,
    playerKey: row.player_key ?? "",
    playerName: row.player_name,
    rebuys: row.rebuys === null || row.rebuys === undefined ? null : Number(row.rebuys),
    startedAt: row.started_at,
    telegramId: row.telegram_id === null ? null : Number(row.telegram_id),
  }));
}

async function readAccounts(supabase: SupabaseClient): Promise<ClubAccount[]> {
  const rows = await readAllPages<RawAccount>((from, to) =>
    supabase
      .from("client_bot_users")
      .select("id, telegram_id, display_name, avatar_url, avatar_thumb_url")
      .not("display_name", "is", null)
      .order("id")
      .range(from, to),
  );

  return rows.map((row) => ({
    avatarUrl: row.avatar_thumb_url ?? row.avatar_url,
    displayName: row.display_name,
    id: row.id,
    telegramId: row.telegram_id === null ? null : Number(row.telegram_id),
  }));
}

/** Costs headers only: the rows themselves are not sent. Null when it cannot be told. */
async function countResults(supabase: SupabaseClient) {
  const { count, error } = await supabase
    .from("tournament_results")
    .select("id", { count: "exact", head: true });

  return error ? null : count;
}

type Snapshot = { club: ClubAchievements; readAt: number; results: number };

let snapshot: Snapshot | null = null;
let reading: Promise<Snapshot> | null = null;

async function readSnapshot(supabase: SupabaseClient): Promise<Snapshot> {
  const [results, accounts] = await Promise.all([readAllResults(supabase), readAccounts(supabase)]);

  return {
    club: buildClubAchievements(results, accounts),
    readAt: Date.now(),
    results: results.length,
  };
}

/**
 * Everyone's achievements, counted once for the whole club and reused.
 *
 * The answer is the same for every player, so it is kept for an hour and checked on each
 * request against the number of stored results: a game finishing adds rows, so the
 * players who open the screen that night see it counted straight away, while a quiet
 * week costs a single tiny count per visit.
 */
export async function readClubAchievements(supabase: SupabaseClient): Promise<ClubAchievements> {
  if (snapshot && Date.now() - snapshot.readAt < CACHE_TTL_MS) {
    const results = await countResults(supabase);
    // A count that could not be taken keeps the reading rather than paying for a new one.
    if (results === null || results === snapshot.results) return snapshot.club;
  }

  // Players opening the screen together share one reading instead of starting one each.
  reading ??= readSnapshot(supabase).finally(() => {
    reading = null;
  });
  snapshot = await reading;

  return snapshot.club;
}
