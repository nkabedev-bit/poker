import type { TournamentExtrasPatch } from "@/lib/tournament-extras-shared";
import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

/**
 * How long the desk keeps working a finished evening.
 *
 * Long enough for the room to settle up and go home. The roster itself has to be
 * cleared at the finish — sign-ups for the next tournament are already being seated by
 * then — so the desk gets a copy that expires instead.
 */
const SETTLING_HOURS = 1;

export function getFinishTournamentExtrasPatch(
  players: TournamentPlayer[] = [],
  now: Date = new Date(),
): TournamentExtrasPatch {
  return {
    // The draws belong to the evening that just ended: the next tournament runs its own.
    players: [],
    raffle: null,
    raffleHistory: [],
    settling: {
      closesAt: new Date(now.getTime() + SETTLING_HOURS * 60 * 60 * 1000).toISOString(),
      players,
    },
  };
}

/**
 * The players the desk is still settling with, if the hour has not run out.
 *
 * Read only when the room is empty: once the next tournament is being seated, the live
 * roster is the one that matters and the copy is history.
 */
export function getSettlingPlayers(
  extras: Pick<TournamentExtras, "players" | "settling">,
  now: Date = new Date(),
): TournamentPlayer[] {
  if (extras.players.length > 0) return extras.players;

  const settling = extras.settling;
  if (!settling) return [];

  const closesAt = new Date(settling.closesAt).getTime();
  if (!Number.isFinite(closesAt) || closesAt <= now.getTime()) return [];

  return settling.players;
}
