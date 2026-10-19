import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { buildPlayerResultsFilter, isFinalTableFinish } from "@/lib/results/player-stats";
import { readAllPages } from "@/lib/supabase/read-all-pages";

/** A newcomer is counted as brought in once they have come back: their second game. */
export const INVITEE_COUNTS_AFTER_GAMES = 2;
/** "Настоящий проповедник": a newcomer who has played this many tournaments. */
export const INVITEE_REGULAR_GAMES = 10;

/** What one player the account brought in has done since. */
export type InviteeRecord = { games: number; top9: number };

export type InviteStats = {
  /** Newcomers who have reached a final table. */
  invitedFinalists: number;
  /** Newcomers who have come back for a second game. */
  invitedPlayers: number;
  /** Newcomers who have become regulars. */
  invitedRegulars: number;
};

export const NO_INVITES: InviteStats = { invitedFinalists: 0, invitedPlayers: 0, invitedRegulars: 0 };

export function computeInviteStats(invitees: InviteeRecord[]): InviteStats {
  return {
    invitedFinalists: invitees.filter((invitee) => invitee.top9 >= 1).length,
    invitedPlayers: invitees.filter((invitee) => invitee.games >= INVITEE_COUNTS_AFTER_GAMES).length,
    invitedRegulars: invitees.filter((invitee) => invitee.games >= INVITEE_REGULAR_GAMES).length,
  };
}

/** A game of one of the newcomers, as much of it as the invites need. */
export type InviteeGame = {
  /** How many places made the final table that evening; null before it was kept. */
  finalTableSize?: number | null;
  place: number | null;
  playerKey: string;
  telegramId: number | null;
};

type StoredInviteeGame = {
  final_table_size?: number | string | null;
  place: number | null;
  player_key: string | null;
  telegram_id: number | null;
};

const INVITEE_GAME_COLUMNS = "place, player_key, telegram_id";

/** Counts a newcomer's games and final tables among the rows given. */
export function summarizeInvitee(
  invitee: { nickname: string; telegramId: number | null },
  games: InviteeGame[],
): InviteeRecord {
  const key = buildNicknameKey(invitee.nickname);
  const theirs = games.filter(
    (game) =>
      (invitee.telegramId !== null && game.telegramId === invitee.telegramId) ||
      (Boolean(key) && game.playerKey === key),
  );

  return {
    games: theirs.length,
    top9: theirs.filter(isFinalTableFinish).length,
  };
}

/**
 * What the players an account brought in have done: read from the link the newcomer's
 * questionnaire made, and from their games.
 *
 * Nobody learns from this who brought whom — only the count reaches the screen. The
 * link comes with a migration applied by hand; until it is there, and whenever a read
 * fails, the account simply has no invites to show.
 */
export async function readInviteStats(
  supabase: SupabaseClient,
  accountId: string | null,
): Promise<InviteStats> {
  if (!accountId) return NO_INVITES;

  try {
    const { data, error } = await supabase
      .from("client_bot_users")
      .select("display_name, telegram_id")
      .eq("referred_by_user_id", accountId);
    if (error) throw error;

    const invitees = ((data ?? []) as Array<{ display_name: string | null; telegram_id: number | null }>)
      .map((row) => ({
        nickname: row.display_name ?? "",
        telegramId: row.telegram_id === null ? null : Number(row.telegram_id),
      }))
      .filter((invitee) => invitee.telegramId !== null || buildNicknameKey(invitee.nickname));
    if (invitees.length === 0) return NO_INVITES;

    const filter = invitees
      .map((invitee) => buildPlayerResultsFilter(invitee.telegramId, invitee.nickname))
      .join(",");
    const readGames = (columns: string) =>
      readAllPages<StoredInviteeGame>((from, to) =>
        supabase
          .from("tournament_results")
          .select(columns)
          .or(filter)
          .order("id")
          .range(from, to),
      );

    // The final table's size came with a migration applied by hand too: until it is
    // there, every game counts nine-handed, as it did before.
    let games: StoredInviteeGame[];
    try {
      games = await readGames(`${INVITEE_GAME_COLUMNS}, final_table_size`);
    } catch (error) {
      if (!String((error as { message?: unknown })?.message ?? "").includes("final_table_size")) {
        throw error;
      }
      games = await readGames(INVITEE_GAME_COLUMNS);
    }

    const rows: InviteeGame[] = games.map((game) => ({
      finalTableSize:
        game.final_table_size === null || game.final_table_size === undefined
          ? null
          : Number(game.final_table_size),
      place: game.place,
      playerKey: game.player_key ?? "",
      telegramId: game.telegram_id === null ? null : Number(game.telegram_id),
    }));

    return computeInviteStats(invitees.map((invitee) => summarizeInvitee(invitee, rows)));
  } catch (error) {
    console.warn("Invites are unavailable for the achievements", error);
    return NO_INVITES;
  }
}
