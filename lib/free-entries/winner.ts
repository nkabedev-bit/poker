import type { TournamentPlayer } from "@/lib/timer/types";

export const WINNER_PASS_MESSAGE =
  "Поздравляем с победой! Бесплатная проходка начислена на ваш аккаунт";

/**
 * The player who took first place, or null when nobody has.
 *
 * A tournament closed with the finish button while several players are still in has no
 * first place, and pays no pass.
 */
export function findTournamentWinner(players: TournamentPlayer[]) {
  const winners = players.filter((player) => player.finishPlace === 1);
  return winners.length === 1 ? winners[0] : null;
}
