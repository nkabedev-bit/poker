import type { TournamentExtrasPatch } from "@/lib/tournament-extras-shared";

export function getFinishTournamentExtrasPatch(): TournamentExtrasPatch {
  return { players: [] };
}
