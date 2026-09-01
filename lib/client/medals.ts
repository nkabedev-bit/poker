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

// How many of the seven the player has taken at least once — the header counter.
export function countEarnedMedals(medals: Medal[]) {
  return medals.filter((medal) => medal.count > 0).length;
}
