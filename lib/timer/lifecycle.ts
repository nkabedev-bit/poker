import type { TournamentExtrasPatch } from "@/lib/tournament-extras-shared";

export function getFinishTournamentExtrasPatch(): TournamentExtrasPatch {
  // The draws belong to the evening that just ended: the next tournament runs its own.
  //
  // The roster stays. The last hand does not end the evening for the desk — half the
  // room has yet to settle up, and clearing the players took the list of who owes what
  // off the screen with them. It is cleared when the next tournament begins instead,
  // which is the moment a roster actually stops being this one.
  return { raffle: null, raffleHistory: [] };
}

/** Starting a new tournament is what ends the last one's roster. */
export function getStartTournamentExtrasPatch(): TournamentExtrasPatch {
  return { players: [] };
}
