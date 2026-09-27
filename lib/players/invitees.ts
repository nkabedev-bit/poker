import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { buildPlayerResultsFilter } from "@/lib/results/player-stats";
import { readAllPages } from "@/lib/supabase/read-all-pages";

/** A newcomer is counted as brought in once they have come back: their second game. */
export const INVITEE_COUNTS_AFTER_GAMES = 2;
/** "Настоящий проповедник": a newcomer who has played this many tournaments. */
export const INVITEE_REGULAR_GAMES = 10;
const FINAL_TABLE_PLACES = 9;

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
export type InviteeGame = { place: number | null; playerKey: string; telegramId: number | null };

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
    top9: theirs.filter(
      (game) => game.place !== null && game.place >= 1 && game.place <= FINAL_TABLE_PLACES,
    ).length,
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
    const games = await readAllPages<{
      place: number | null;
      player_key: string | null;
      telegram_id: number | null;
    }>((from, to) =>
      supabase
        .from("tournament_results")
        .select("place, player_key, telegram_id")
        .or(filter)
        .order("id")
        .range(from, to),
    );

    const rows: InviteeGame[] = games.map((game) => ({
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
