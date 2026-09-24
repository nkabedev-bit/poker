/**
 * The numbers of one evening, which are the players it can hold.
 *
 * A number is spoken for by whoever held it tonight — a player who busted is still in the
 * draw and on the club's sheet — so an evening runs through its numbers as players come
 * and go, not as chairs empty. The club sits 27 at a time, but busted players are
 * replaced by latecomers and the waiting list, and more than thirty pass through in a
 * night. So:
 *
 *   regular tickets — 1 to 20, and 36 to 40 once those are gone;
 *   VIP tickets     — 21 to 35;
 *
 * forty numbers, and forty players an evening at most. VIP is still "21 and up" the way
 * the room has always read it; the regular overflow sits above the VIP range rather than
 * inside it. The database hands out the same numbers (append_tournament_player).
 */
export const REGULAR_REGISTRATION_NUMBER_RANGES = [
  [1, 20],
  [36, 40],
] as const;

export const VIP_REGISTRATION_NUMBER_RANGE = [21, 35] as const;

export const VIP_REGISTRATION_NUMBER_MIN = VIP_REGISTRATION_NUMBER_RANGE[0];

export const VIP_REGISTRATION_NUMBER_MAX = VIP_REGISTRATION_NUMBER_RANGE[1];

/** Every number there is: nobody past the fortieth player can be called by one. */
export const REGISTRATION_NUMBERS_PER_EVENING = 40;

/** The club seats its VIP guests at the last of the three tables. */
export const VIP_TABLE_NUMBER = 3;

export type PlayerCategory = "VIP" | "Normal";

/**
 * Whether a player takes a number out of the VIP range.
 *
 * The ticket decides it, not the chair: a VIP guest who prefers a regular table still
 * belongs to the VIP draw, which is run on those numbers. A player added by hand carries
 * no ticket, so for them the VIP table decides as it always did.
 */
export function shouldTakeVipNumber(
  ticketType: string | null | undefined,
  tableNumber: number,
) {
  if (ticketType === "vip") return true;
  if (ticketType === "regular") return false;

  return tableNumber === VIP_TABLE_NUMBER;
}

export function isVipRegistrationNumber(registrationNumber?: number | null) {
  const value = Number(registrationNumber);
  return (
    Number.isInteger(value) &&
    value >= VIP_REGISTRATION_NUMBER_MIN &&
    value <= VIP_REGISTRATION_NUMBER_MAX
  );
}

export function getPlayerCategory(registrationNumber?: number | null): PlayerCategory {
  return isVipRegistrationNumber(registrationNumber) ? "VIP" : "Normal";
}

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
