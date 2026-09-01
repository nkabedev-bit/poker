export const VIP_REGISTRATION_NUMBER_MIN = 21;
export const VIP_REGISTRATION_NUMBER_MAX = 30;

export type PlayerCategory = "VIP" | "Normal";

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
