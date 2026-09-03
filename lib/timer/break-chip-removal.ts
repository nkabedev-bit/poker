import type { BlindLevel } from "@/lib/timer/types";

/**
 * What the club takes off the tables on each break. The small denominations leave the
 * game in the same order every tournament, so the screen announces the one that is due
 * instead of the dealers remembering it.
 */
const CHIP_REMOVAL_BY_BREAK = [
  "ВЫВОД ФИШЕК НОМИНАЛОМ 5",
  "ВЫВОД ФИШЕК НОМИНАЛОМ 25 И 50",
  "ВЫВОД ФИШЕК НОМИНАЛОМ 100",
];

/** How many breaks have started by this level, the current one included. */
export function getBreakNumber(levels: BlindLevel[], currentLevelIndex: number) {
  if (currentLevelIndex < 0 || !levels[currentLevelIndex]?.isBreak) return null;

  return levels.slice(0, currentLevelIndex + 1).filter((level) => level.isBreak).length;
}

/**
 * The announcement for the break now running, or null outside a break and on the later
 * ones, where there is nothing left to take off the tables.
 */
export function getBreakChipRemovalNotice(levels: BlindLevel[], currentLevelIndex: number) {
  const breakNumber = getBreakNumber(levels, currentLevelIndex);
  if (breakNumber === null) return null;

  return CHIP_REMOVAL_BY_BREAK[breakNumber - 1] ?? null;
}
