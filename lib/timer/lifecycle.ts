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
const SETTLING_MS = SETTLING_HOURS * 60 * 60 * 1000;

export function getFinishTournamentExtrasPatch(
  players: TournamentPlayer[] = [],
  now: Date = new Date(),
): TournamentExtrasPatch {
  return {
    // The draws belong to the evening that just ended: the next tournament runs its own.
    players: [],
    raffle: null,
    raffleHistory: [],
    // A reseating left open at the finish would greet the next tournament on its screens.
    tableMerge: null,
    settling: {
      closesAt: new Date(now.getTime() + SETTLING_MS).toISOString(),
      players,
    },
  };
}

/**
 * The roster the money tab is written from, or null when there is none to write from.
 *
 * While the room is full, the live roster. Once the evening is over, the desk's copy: it
 * is the only record of who settled up after the finish. Unlike the desk, the sheet keeps
 * reading it after the hour is up, so a rebuild later that night does not strike the
 * payments back off. A copy made before the session being written began belongs to an
 * earlier evening and gives nothing.
 */
export function getFinanceRoster(
  extras: Pick<TournamentExtras, "players" | "settling">,
  sessionStartedAt: string | null,
): TournamentPlayer[] | null {
  if (extras.players.length > 0) return extras.players;

  const settling = extras.settling;
  if (!settling || settling.players.length === 0 || !sessionStartedAt) return null;

  // The copy is made at the finish and closes an hour after it.
  const finishedAt = new Date(settling.closesAt).getTime() - SETTLING_MS;
  const startedAt = new Date(sessionStartedAt).getTime();
  if (!Number.isFinite(finishedAt) || !Number.isFinite(startedAt) || finishedAt < startedAt) {
    return null;
  }

  return settling.players;
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
