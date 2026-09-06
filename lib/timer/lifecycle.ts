import type { TournamentExtrasPatch } from "@/lib/tournament-extras-shared";

export function getFinishTournamentExtrasPatch(): TournamentExtrasPatch {
  // The draws belong to the evening that just ended: the next tournament runs its own.
  return { players: [], raffle: null, raffleHistory: [] };
}
