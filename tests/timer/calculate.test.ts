import { describe, expect, it } from "vitest";
import {
  calculateRemainingSeconds,
  getCurrentAndNextLevel,
  isReentryAvailable,
} from "@/lib/timer/calculate";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

const levels: BlindLevel[] = [
  {
    id: "1",
    levelOrder: 1,
    smallBlind: 25,
    bigBlind: 50,
    ante: 0,
    reentryCloses: false,
    durationSeconds: 1200,
    isBreak: false,
    breakDurationSeconds: null,
  },
  {
    id: "2",
    levelOrder: 2,
    smallBlind: 50,
    bigBlind: 100,
    ante: 0,
    reentryCloses: false,
    durationSeconds: 1200,
    isBreak: false,
    breakDurationSeconds: null,
  },
];

describe("calculateRemainingSeconds", () => {
  it("returns full level duration before timer starts", () => {
    const state: TimerState = {
      status: "not_started",
      currentLevelIndex: 0,
      levelStartedAt: null,
      pausedRemainingSeconds: null,
      registrationClosesAt: null,
      finishedAt: null,
    };

    expect(
      calculateRemainingSeconds(state, levels, new Date("2026-04-28T17:00:00Z")),
    ).toBe(1200);
  });

  it("counts down from levelStartedAt while running", () => {
    const state: TimerState = {
      status: "running",
      currentLevelIndex: 0,
      levelStartedAt: "2026-04-28T17:00:00.000Z",
      pausedRemainingSeconds: null,
      registrationClosesAt: null,
      finishedAt: null,
    };

    expect(
      calculateRemainingSeconds(state, levels, new Date("2026-04-28T17:05:00Z")),
    ).toBe(900);
  });

  it("uses pausedRemainingSeconds while paused", () => {
    const state: TimerState = {
      status: "paused",
      currentLevelIndex: 0,
      levelStartedAt: "2026-04-28T17:00:00.000Z",
      pausedRemainingSeconds: 444,
      registrationClosesAt: null,
      finishedAt: null,
    };

    expect(
      calculateRemainingSeconds(state, levels, new Date("2026-04-28T17:10:00Z")),
    ).toBe(444);
  });

  it("never returns a negative countdown", () => {
    const state: TimerState = {
      status: "running",
      currentLevelIndex: 0,
      levelStartedAt: "2026-04-28T17:00:00.000Z",
      pausedRemainingSeconds: null,
      registrationClosesAt: null,
      finishedAt: null,
    };

    expect(
      calculateRemainingSeconds(state, levels, new Date("2026-04-28T18:00:00Z")),
    ).toBe(0);
  });
});

describe("getCurrentAndNextLevel", () => {
  it("returns current and next blind levels", () => {
    expect(getCurrentAndNextLevel(levels, 0)).toEqual({
      current: levels[0],
      next: levels[1],
    });
  });

  it("returns null next level on the final level", () => {
    expect(getCurrentAndNextLevel(levels, 1)).toEqual({
      current: levels[1],
      next: null,
    });
  });
});

describe("isReentryAvailable", () => {
  const cutoffLevels: BlindLevel[] = [
    { ...levels[0], id: "before-cutoff", levelOrder: 1 },
    {
      id: "break-before-cutoff",
      levelOrder: 2,
      smallBlind: null,
      bigBlind: null,
      ante: null,
      reentryCloses: false,
      durationSeconds: 300,
      isBreak: true,
      breakDurationSeconds: 300,
    },
    { ...levels[1], id: "cutoff", levelOrder: 3, reentryCloses: true },
    {
      id: "break-after-cutoff",
      levelOrder: 4,
      smallBlind: null,
      bigBlind: null,
      ante: null,
      reentryCloses: false,
      durationSeconds: 300,
      isBreak: true,
      breakDurationSeconds: 300,
    },
  ];

  function timerState(currentLevelIndex: number, status: TimerState["status"] = "paused"): TimerState {
    return {
      status,
      currentLevelIndex,
      levelStartedAt: "2026-04-28T17:00:00.000Z",
      pausedRemainingSeconds: 100,
      registrationClosesAt: null,
      finishedAt: null,
    };
  }

  it("allows re-entry before the checked level and closes it from the checked level", () => {
    expect(isReentryAvailable(timerState(0), cutoffLevels, new Date("2026-04-28T17:00:00Z"))).toBe(true);
    expect(isReentryAvailable(timerState(1), cutoffLevels, new Date("2026-04-28T17:00:00Z"))).toBe(true);
    expect(isReentryAvailable(timerState(2), cutoffLevels, new Date("2026-04-28T17:00:00Z"))).toBe(false);
    expect(isReentryAvailable(timerState(3), cutoffLevels, new Date("2026-04-28T17:00:00Z"))).toBe(false);
  });

  it("allows re-entry when no level is checked", () => {
    expect(
      isReentryAvailable(
        timerState(1),
        cutoffLevels.map((level) => ({ ...level, reentryCloses: false })),
        new Date("2026-04-28T17:00:00Z"),
      ),
    ).toBe(true);
  });

  it("closes re-entry when the tournament is finished", () => {
    expect(isReentryAvailable(timerState(0, "finished"), cutoffLevels, new Date("2026-04-28T17:00:00Z"))).toBe(false);
  });
});
