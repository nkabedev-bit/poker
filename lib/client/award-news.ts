import type { Achievement, AchievementIcon } from "@/lib/client/achievements";
import type { Medal } from "@/lib/client/medals";
import { TIER_TITLES, type PlayerTier } from "@/lib/players/tier";

/**
 * The kinds of award a player is told about. Each is remembered on its own shelf, so a
 * screen that only knows achievements never mistakes the medals for news.
 */
export type AwardShelf = "achievements" | "medals" | "tier";

/** One award as the celebration shows it. */
export type AwardNews = {
  description: string;
  icon: AchievementIcon;
  /** The award's own key on its shelf: an achievement id, a medal key, a tier. */
  id: string;
  shelf: AwardShelf;
  title: string;
};

/** What each shelf held the last time it was looked at; null when nothing was stored. */
export type SeenAwards = Partial<Record<AwardShelf, readonly string[] | null>>;

const TIER_NEWS: Record<PlayerTier, string> = {
  champion: "Высший статус клуба.",
  core: "Новый статус в клубе.",
  legend: "Новый статус в клубе.",
  // MEMBER is also the rung that opens the favourite hand, which is worth saying here.
  member: "Новый статус в клубе. Открыта любимая рука на аватарке.",
};

/** Everything the player holds right now, as the news it would make. */
export function listHeldAwards({
  achievements = [],
  medals = [],
  tier = null,
}: {
  achievements?: readonly Achievement[];
  medals?: readonly Medal[];
  tier?: PlayerTier | null;
}): AwardNews[] {
  return [
    ...achievements
      .filter((achievement) => achievement.earned)
      .map((achievement) => ({
        description: achievement.description,
        icon: achievement.icon,
        id: achievement.id,
        shelf: "achievements" as const,
        title: achievement.title,
      })),
    ...medals
      .filter((medal) => medal.count > 0)
      .map((medal) => ({
        description: medal.description,
        icon: medal.icon,
        id: medal.key,
        shelf: "medals" as const,
        title: medal.title,
      })),
    ...(tier
      ? [
          {
            description: TIER_NEWS[tier],
            icon: "crown" as const,
            id: tier,
            shelf: "tier" as const,
            title: TIER_TITLES[tier],
          },
        ]
      : []),
  ];
}

/**
 * Which of the held awards the player has not been shown, and what every shelf reads once
 * they have been.
 *
 * Only the shelves named in `seen` are looked at. A shelf with nothing stored — the first
 * visit after this shipped, or a new phone on the web — is filled in without a word:
 * twenty old achievements going off at once would be noise, not news.
 */
export function findAwardNews(held: readonly AwardNews[], seen: SeenAwards) {
  const fresh: AwardNews[] = [];
  const next: Partial<Record<AwardShelf, string[]>> = {};

  for (const shelf of Object.keys(seen) as AwardShelf[]) {
    const onShelf = held.filter((award) => award.shelf === shelf);
    const known = seen[shelf] ?? null;

    if (known) fresh.push(...onShelf.filter((award) => !known.includes(award.id)));
    next[shelf] = [...new Set([...(known ?? []), ...onShelf.map((award) => award.id)])];
  }

  return { fresh, next };
}
