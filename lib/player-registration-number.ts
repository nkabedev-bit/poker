/**
 * The numbers of one evening, which are the players it can hold.
 *
 * A number is spoken for by whoever held it tonight — a player who busted is still in the
 * draw and on the club's sheet — so an evening runs through its numbers as players come
 * and go, not as chairs empty. The club sits 27 at a time, but busted players are
 * replaced by latecomers and the waiting list, and more than thirty pass through in a
 * night. So the numbers run 1 to 40 in the order players are seated, and forty players
 * an evening is the most there can be. The database hands out the same numbers
 * (append_tournament_player).
 */
export const REGISTRATION_NUMBERS_PER_EVENING = 40;

export type PlayerWithRegistrationNumber = {
  name: string;
  registrationNumber?: number | null;
};

export function formatPlayerNameWithRegistrationNumber(player: PlayerWithRegistrationNumber) {
  const registrationNumber = Number(player.registrationNumber);
  if (!Number.isInteger(registrationNumber) || registrationNumber <= 0) {
    return player.name;
  }

  return `#${registrationNumber} ${player.name}`;
}

/**
 * Whether the club has called this player by a number tonight.
 *
 * The number is handed out at the door together with the ticket, so it is what tells a
 * player who came from one who only signed up: somebody who never turned up stays on
 * the roster without one.
 */
export function hasRegistrationNumber(player: PlayerWithRegistrationNumber) {
  const registrationNumber = Number(player.registrationNumber);
  return Number.isInteger(registrationNumber) && registrationNumber > 0;
}
