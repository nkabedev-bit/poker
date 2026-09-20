import { describe, expect, it } from "vitest";
import { readLiveTournament } from "@/app/client/_components/use-live-tournament";
import { formatRegistrationLeft } from "@/app/client/_components/live-tournament-card";
import type { ClientLiveState, LiveBlindLevel } from "@/lib/client-tma/live-state-shared";

function level(overrides: Partial<LiveBlindLevel> = {}): LiveBlindLevel {
  return {
    ante: 100,
    bigBlind: 200,
    breakDurationSeconds: null,
    durationSeconds: 1200,
    isBreak: false,
    levelOrder: 1,
    smallBlind: 100,
    ...overrides,
  };
}

const LEVELS = [
  level({ levelOrder: 1 }),
  level({ ante: 200, bigBlind: 400, levelOrder: 2, smallBlind: 200 }),
  level({ breakDurationSeconds: 600, durationSeconds: 600, isBreak: true, levelOrder: 3 }),
  level({ ante: 300, bigBlind: 600, levelOrder: 4, smallBlind: 300 }),
];

function state(overrides: Partial<ClientLiveState> = {}): ClientLiveState {
  return {
    activePlayers: 10,
    blindLevels: null,
    currentLevelIndex: 0,
    levelStartedAt: "2026-09-20T15:00:00.000Z",
    levelsVersion: "4:",
    pausedRemainingSeconds: null,
    registrationClosesAt: null,
    status: "running",
    totalPlayers: 14,
    tournamentName: "Bounty Classic",
    ...overrides,
  };
}

describe("readLiveTournament", () => {
  it("counts the level down from when it started, without asking the club", () => {
    const live = readLiveTournament(state(), LEVELS, new Date("2026-09-20T15:05:00.000Z"));

    expect(live?.remainingSeconds).toBe(900);
    expect(live?.roundNumber).toBe(1);
    expect(live?.currentLevel?.bigBlind).toBe(200);
  });

  // The desk does not tap anything when a level runs out — the clock is read from the
  // start time, so the phone has to roll forward on its own.
  it("rolls on to the next level once the first has run out", () => {
    const live = readLiveTournament(state(), LEVELS, new Date("2026-09-20T15:25:00.000Z"));

    expect(live?.roundNumber).toBe(2);
    expect(live?.currentLevel?.bigBlind).toBe(400);
    expect(live?.remainingSeconds).toBe(900);
  });

  it("says the room is on a break, and does not count the break as a round", () => {
    const live = readLiveTournament(state(), LEVELS, new Date("2026-09-20T15:45:00.000Z"));

    expect(live?.isBreak).toBe(true);
    expect(live?.roundNumber).toBe(2);

    const afterBreak = readLiveTournament(state(), LEVELS, new Date("2026-09-20T15:55:00.000Z"));

    expect(afterBreak?.isBreak).toBe(false);
    expect(afterBreak?.roundNumber).toBe(3);
  });

  it("holds the clock where the desk paused it", () => {
    const live = readLiveTournament(
      state({ currentLevelIndex: 1, pausedRemainingSeconds: 314, status: "paused" }),
      LEVELS,
      new Date("2026-09-20T16:30:00.000Z"),
    );

    expect(live?.isPaused).toBe(true);
    expect(live?.remainingSeconds).toBe(314);
  });

  it("carries how many are still in", () => {
    const live = readLiveTournament(state({ activePlayers: 7 }), LEVELS, new Date("2026-09-20T15:05:00.000Z"));

    expect(live).toMatchObject({ activePlayers: 7, totalPlayers: 14 });
  });

  it("draws nothing while the room is quiet", () => {
    expect(readLiveTournament(null, LEVELS, new Date())).toBeNull();
  });

  // The levels ride along on the first load; until they arrive there is no grid to read.
  it("survives a state whose blind grid has not arrived yet", () => {
    const live = readLiveTournament(state(), [], new Date("2026-09-20T15:05:00.000Z"));

    expect(live?.currentLevel).toBeNull();
    expect(live?.remainingSeconds).toBe(0);
    expect(live?.tournamentName).toBe("Bounty Classic");
  });
});

describe("formatRegistrationLeft", () => {
  const now = new Date("2026-09-20T15:00:00.000Z");

  it("counts the window in hours and minutes", () => {
    expect(formatRegistrationLeft("2026-09-20T17:24:00.000Z", now)).toBe("2 ч 24 мин");
  });

  it("drops to minutes in the last hour", () => {
    expect(formatRegistrationLeft("2026-09-20T15:20:00.000Z", now)).toBe("20 мин");
  });

  it("says nothing once registration has closed", () => {
    expect(formatRegistrationLeft("2026-09-20T14:59:00.000Z", now)).toBeNull();
    expect(formatRegistrationLeft(null, now)).toBeNull();
  });
});
