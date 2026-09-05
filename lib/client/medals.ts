import type { AchievementIcon } from "@/lib/client/achievements";

// One medal per tournament the club runs. Winning that tournament adds one to its
// counter, so a medal is a tally rather than a one-off badge.
export const MEDAL_KEYS = [
  "phoenix",
  "deepstack",
  "bounty",
  "progressive",
  "mystery",
  "freeroll",
  "lastchance",
] as const;

export type MedalKey = (typeof MEDAL_KEYS)[number];

export type Medal = {
  count: number;
  description: string;
  icon: AchievementIcon;
  key: MedalKey;
  title: string;
};

export const MEDAL_DESCRIPTION = "Выиграй турнир, чтобы получить медаль";

const MEDALS: { icon: AchievementIcon; key: MedalKey; title: string }[] = [
  { icon: "flame", key: "phoenix", title: "PHOENIX" },
  { icon: "layers", key: "deepstack", title: "DEEP STACK" },
  { icon: "target", key: "bounty", title: "BOUNTY" },
  { icon: "zap", key: "progressive", title: "PROGRESSIVE" },
  { icon: "gift", key: "mystery", title: "MYSTERY" },
  { icon: "ticket", key: "freeroll", title: "FREEROLL" },
  { icon: "clock", key: "lastchance", title: "LAST CHANCE" },
];

export const MEDALS_TOTAL = MEDALS.length;

function readCount(counts: Partial<Record<string, unknown>>, key: MedalKey) {
  const count = Math.floor(Number(counts[key] ?? 0));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function getMedals(counts: Partial<Record<string, unknown>> | null | undefined): Medal[] {
  const source = counts ?? {};

  return MEDALS.map((medal) => ({
    count: readCount(source, medal.key),
    description: MEDAL_DESCRIPTION,
    icon: medal.icon,
    key: medal.key,
    title: medal.title,
  }));
}

export function isMedalKey(value: unknown): value is MedalKey {
  return MEDAL_KEYS.includes(value as MedalKey);
}

/**
 * Which medal winning this tournament is worth.
 *
 * The type the admin picked wins; a tournament set up by hand falls back to what its
 * format and bounty mode say. A combination that is none of the seven club tournaments
 * — Dealer Revenge, say — is worth no medal, and says so.
 */
export function resolveMedalKey(settings: {
  bountyType?: string | null;
  isBounty?: boolean | null;
  tournamentFormat?: string | null;
  tournamentPreset?: string | null;
}): MedalKey | null {
  const preset = settings.tournamentPreset?.trim();
  if (preset) return isMedalKey(preset) ? preset : null;

  const format = settings.tournamentFormat?.trim() || "regular";
  if (isMedalKey(format) && format !== "bounty") return format;

  if (!settings.isBounty) return null;

  const bounty = settings.bountyType;
  if (bounty === "standard") return "bounty";

  return bounty === "progressive" || bounty === "mystery" ? bounty : null;
}

/**
 * The medals a player holds: the club's own record of what they won before the app
 * counted anything, plus every first place the results themselves know about.
 *
 * Counting the second half from the results rather than tallying it at finish time is
 * what lets a game deleted in the admin take its medal with it.
 */
export function mergeMedalCounts(
  historical: Partial<Record<string, unknown>> | null | undefined,
  fromResults: Partial<Record<string, number>>,
): Record<string, number> {
  const total: Record<string, number> = {};

  for (const key of MEDAL_KEYS) {
    const base = Math.floor(Number(historical?.[key] ?? 0));
    const earned = Math.floor(Number(fromResults[key] ?? 0));
    const count =
      (Number.isFinite(base) && base > 0 ? base : 0) +
      (Number.isFinite(earned) && earned > 0 ? earned : 0);

    if (count > 0) total[key] = count;
  }

  return total;
}

// How many of the seven the player has taken at least once — the header counter.
export function countEarnedMedals(medals: Medal[]) {
  return medals.filter((medal) => medal.count > 0).length;
}
