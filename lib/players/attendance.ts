import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { canonicalKeyOf, canonicalNicknameKey } from "@/lib/players/nickname-merges";

const PAGE_SIZE = 1000;

export type AttendanceRow = {
  firstGame: string;
  lastGame: string;
  player: string;
  visits: number;
};

type ResultRow = {
  played_on: string;
  player_key: string | null;
  player_name: string;
};

type AccountRow = {
  display_name: string | null;
  nickname_key: string | null;
};

type Group = {
  evenings: Set<string>;
  firstGame: string;
  lastGame: string;
  /** How often each spelling was used, and the last evening it was used on. */
  spellings: Map<string, { count: number; lastGame: string }>;
};

/**
 * How many evenings each player of the club has behind them.
 *
 * Counted from the games themselves — every evening the club has a record of, whether it
 * was played in the app or imported from the old spreadsheets. An evening is counted once
 * however many rows it left behind: a game stored twice under two spellings is still one
 * night in the room.
 *
 * The name shown is the one the club calls the player now: their account's nickname, or —
 * for a guest who never started the bot — the spelling their history uses most.
 */
export function buildAttendanceRows(
  results: ResultRow[],
  accounts: AccountRow[] = [],
): AttendanceRow[] {
  const groups = new Map<string, Group>();

  for (const row of results) {
    const playerKey = row.player_key || buildNicknameKey(row.player_name ?? "");
    const key = canonicalKeyOf(playerKey);
    if (!key) continue;

    const playedOn = String(row.played_on ?? "");
    if (!playedOn) continue;

    const group = groups.get(key) ?? {
      evenings: new Set<string>(),
      firstGame: playedOn,
      lastGame: playedOn,
      spellings: new Map<string, { count: number; lastGame: string }>(),
    };

    group.evenings.add(playedOn);
    if (playedOn < group.firstGame) group.firstGame = playedOn;
    if (playedOn > group.lastGame) group.lastGame = playedOn;

    const spelling = String(row.player_name ?? "").trim();
    if (spelling) {
      const seen = group.spellings.get(spelling);
      group.spellings.set(spelling, {
        count: (seen?.count ?? 0) + 1,
        lastGame: seen && seen.lastGame > playedOn ? seen.lastGame : playedOn,
      });
    }

    groups.set(key, group);
  }

  const accountNames = new Map<string, string>();
  for (const account of accounts) {
    const name = String(account.display_name ?? "").trim();
    if (!name) continue;

    const key = account.nickname_key
      ? canonicalKeyOf(account.nickname_key)
      : canonicalNicknameKey(name);
    if (!key || accountNames.has(key)) continue;

    accountNames.set(key, name);
  }

  return [...groups]
    .map(([key, group]) => ({
      firstGame: group.firstGame,
      lastGame: group.lastGame,
      player: accountNames.get(key) ?? pickSpelling(group, key),
      visits: group.evenings.size,
    }))
    .sort((a, b) => b.visits - a.visits || a.player.localeCompare(b.player, "ru"));
}

/**
 * What to call a player the bot has never met.
 *
 * The spelling that IS the player's name wins over one that was merged into it, so a group
 * is never labelled "Superman (win season 1)" just because that evening came later. Among
 * equals, the spelling the history uses most, and the most recent settles a tie.
 */
function pickSpelling(group: Group, key: string) {
  let best = "";
  let bestRank: [number, number, string] = [-1, -1, ""];

  for (const [spelling, seen] of group.spellings) {
    const rank: [number, number, string] = [
      buildNicknameKey(spelling) === key ? 1 : 0,
      seen.count,
      seen.lastGame,
    ];

    if (rank[0] > bestRank[0]
      || (rank[0] === bestRank[0] && rank[1] > bestRank[1])
      || (rank[0] === bestRank[0] && rank[1] === bestRank[1] && rank[2] > bestRank[2])) {
      best = spelling;
      bestRank = rank;
    }
  }

  return best;
}

/** Every evening on record, read in pages: years of games are thousands of rows. */
async function readAllResults(supabase: SupabaseClient) {
  const rows: ResultRow[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("tournament_results")
      .select("player_key, player_name, played_on")
      .order("played_on")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as ResultRow[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) return rows;
  }
}

async function readAccounts(supabase: SupabaseClient) {
  const rows: AccountRow[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("client_bot_users")
      .select("display_name, nickname_key")
      .order("id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as AccountRow[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) return rows;
  }
}

/** The club's attendance list, computed from the database. */
export async function readAttendanceRows(supabase: SupabaseClient): Promise<AttendanceRow[]> {
  const [results, accounts] = await Promise.all([
    readAllResults(supabase),
    readAccounts(supabase),
  ]);

  return buildAttendanceRows(results, accounts);
}
