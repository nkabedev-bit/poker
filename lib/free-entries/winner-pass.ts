import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { adjustFreeEntries } from "@/lib/free-entries/adjust";
import { notifyClientUser } from "@/lib/client-bot/notify";
import { findTournamentWinner, WINNER_PASS_MESSAGE } from "@/lib/free-entries/winner";
import type { TournamentPlayer } from "@/lib/timer/types";

/**
 * The winner of every tournament takes a regular free pass home.
 *
 * Called once, at the finish, with the final standings — before the roster is wiped.
 * The pass reaches the profile of anyone seated from a sign-up; a player the admin added
 * by hand has no account behind the seat and is handed it at the table, which is why the
 * ledger line is written either way. The bot message goes out only once the pass is
 * actually in the profile, because it tells the player to look for it there.
 */
export async function grantWinnerPass(supabase: SupabaseClient, players: TournamentPlayer[]) {
  const winner = findTournamentWinner(players);
  if (!winner) return;

  let granted = false;
  if (winner.accountId || winner.telegramId) {
    try {
      const change = await adjustFreeEntries(supabase, {
        delta: 1,
        holder: { accountId: winner.accountId ?? null, telegramId: winner.telegramId ?? null },
        vip: false,
      });
      granted = change !== null;
    } catch (error) {
      console.error("Failed to grant the winner pass", error);
    }
  }

  try {
    const { appendFreeEntryGrant } = await import("@/lib/google-sheets");
    await appendFreeEntryGrant({ count: 1, nickname: winner.name, source: "win", vip: false });
  } catch (sheetError) {
    console.error("Failed to log the winner pass", sheetError);
  }

  if (!granted || !winner.accountId) return;

  try {
    await notifyClientUser(supabase, winner.accountId, WINNER_PASS_MESSAGE);
  } catch (notifyError) {
    console.error("Failed to tell the winner about the pass", notifyError);
  }
}
