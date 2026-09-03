export const VIP_REGISTRATION_NUMBER_MIN = 21;
export const VIP_REGISTRATION_NUMBER_MAX = 30;

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
