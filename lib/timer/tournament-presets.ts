import type { TournamentPresetName } from "@/lib/timer/types";

/** How the admin screens name each tournament type, in the order they list them. */
export const TOURNAMENT_PRESET_LABELS: Record<TournamentPresetName, string> = {
  phoenix: "Феникс",
  deepstack: "Дип стек",
  bounty: "Обычный баунти",
  progressive: "Прогрессив",
  mystery: "Мистери",
  freeroll: "Фриролл",
  lastchance: "Ласт ченс",
};

export const TOURNAMENT_PRESET_NAMES = Object.keys(
  TOURNAMENT_PRESET_LABELS,
) as TournamentPresetName[];

export function isTournamentPresetName(value: unknown): value is TournamentPresetName {
  return TOURNAMENT_PRESET_NAMES.includes(value as TournamentPresetName);
}
