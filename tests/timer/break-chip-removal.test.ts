import { describe, expect, it } from "vitest";
import { getBreakChipRemovalNotice, getBreakNumber } from "@/lib/timer/break-chip-removal";
import type { BlindLevel } from "@/lib/timer/types";

function level(overrides: Partial<BlindLevel> & { levelOrder: number }): BlindLevel {
  return {
    ante: null,
    bigBlind: 200,
    breakDurationSeconds: null,
    durationSeconds: 1200,
    id: `level-${overrides.levelOrder}`,
    isBreak: false,
    reentryCloses: false,
    smallBlind: 100,
    ...overrides,
  };
}

const levels: BlindLevel[] = [
  level({ levelOrder: 1 }),
  level({ levelOrder: 2 }),
  level({ breakDurationSeconds: 600, isBreak: true, levelOrder: 3 }),
  level({ levelOrder: 4 }),
  level({ breakDurationSeconds: 600, isBreak: true, levelOrder: 5 }),
  level({ levelOrder: 6 }),
  level({ breakDurationSeconds: 600, isBreak: true, levelOrder: 7 }),
  level({ levelOrder: 8 }),
  level({ breakDurationSeconds: 600, isBreak: true, levelOrder: 9 }),
];

describe("getBreakNumber", () => {
  it("counts the breaks that have started, the current one included", () => {
    expect(getBreakNumber(levels, 2)).toBe(1);
    expect(getBreakNumber(levels, 4)).toBe(2);
    expect(getBreakNumber(levels, 6)).toBe(3);
  });

  it("says nothing while a round is being played", () => {
    expect(getBreakNumber(levels, 0)).toBeNull();
    expect(getBreakNumber(levels, 3)).toBeNull();
    expect(getBreakNumber(levels, -1)).toBeNull();
    expect(getBreakNumber(levels, 99)).toBeNull();
  });
});

describe("getBreakChipRemovalNotice", () => {
  it("announces the chips that leave the tables on each break", () => {
    expect(getBreakChipRemovalNotice(levels, 2)).toBe("ВЫВОД ФИШЕК НОМИНАЛОМ 5");
    expect(getBreakChipRemovalNotice(levels, 4)).toBe("ВЫВОД ФИШЕК НОМИНАЛОМ 25 И 50");
    expect(getBreakChipRemovalNotice(levels, 6)).toBe("ВЫВОД ФИШЕК НОМИНАЛОМ 100");
  });

  it("stays quiet on a fourth break, when nothing is left to take off", () => {
    expect(getBreakChipRemovalNotice(levels, 8)).toBeNull();
  });

  it("stays quiet during a round", () => {
    expect(getBreakChipRemovalNotice(levels, 1)).toBeNull();
  });
});
