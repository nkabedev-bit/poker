import { describe, expect, it } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import { resolveReentryEligibility } from "@/lib/tma/reentry-eligibility";
import type { BlindLevel, TimerState, TournamentExtras } from "@/lib/timer/types";

const now = new Date("2026-09-01T20:00:00.000Z");

const timerState: TimerState = {
  status: "running",
  currentLevelIndex: 0,
  levelStartedAt: "2026-09-01T19:55:00.000Z",
  pausedRemainingSeconds: null,
  registrationClosesAt: null,
  finishedAt: null,
};

function level(overrides: Partial<BlindLevel> = {}): BlindLevel {
  return {
    id: "level-1",
    levelOrder: 1,
    smallBlind: 50,
    bigBlind: 100,
    ante: 0,
    reentryCloses: false,
    doubleReentryAvailable: false,
    durationSeconds: 1200,
    isBreak: false,
    breakDurationSeconds: 0,
    ...overrides,
  };
}

function settingsWith(overrides: Partial<TournamentExtras["settings"]>) {
  return mergeTournamentExtras({ settings: { reentryEnabled: true, ...overrides } }).settings;
}

function resolve({
  blindLevels = [level({ doubleReentryAvailable: true })],
  player = { doubleRebuys: 0, rebuys: 0 },
  requestedDouble = false,
  requestedReentry = true,
  settings = settingsWith({}),
}: {
  blindLevels?: BlindLevel[];
  player?: { doubleRebuys?: number; rebuys: number };
  requestedDouble?: boolean;
  requestedReentry?: boolean;
  settings?: TournamentExtras["settings"];
} = {}) {
  return resolveReentryEligibility({
    blindLevels,
    now,
    player,
    requestedDouble,
    requestedReentry,
    settings,
    timerState,
  });
}

describe("resolveReentryEligibility", () => {
  it("allows a re-entry and its double while the window and the level allow it", () => {
    expect(resolve({ requestedDouble: true })).toEqual({ reentryDouble: true, usesReentry: true });
  });

  it("refuses everything when re-entries are disabled", () => {
    expect(resolve({ requestedDouble: true, settings: settingsWith({ reentryEnabled: false }) })).toEqual({
      reentryDouble: false,
      usesReentry: false,
    });
  });

  it("refuses a re-entry once the player used up the limit", () => {
    expect(resolve({ player: { rebuys: 1 }, settings: settingsWith({ maxReentries: 1 }) })).toEqual({
      reentryDouble: false,
      usesReentry: false,
    });
  });

  it("refuses a re-entry after the cutoff level closes the window", () => {
    expect(resolve({ blindLevels: [level({ reentryCloses: true })] })).toEqual({
      reentryDouble: false,
      usesReentry: false,
    });
  });

  it("refuses the double when the level does not carry the x2 flag", () => {
    expect(resolve({ blindLevels: [level()], requestedDouble: true })).toEqual({
      reentryDouble: false,
      usesReentry: true,
    });
  });

  it("refuses the double in the PHOENIX format even on an x2 level", () => {
    expect(
      resolve({ requestedDouble: true, settings: settingsWith({ tournamentFormat: "phoenix" }) }),
    ).toEqual({ reentryDouble: false, usesReentry: true });
  });

  it("keeps Wanted Bounty re-entries unlimited but the double once per player", () => {
    const settings = settingsWith({ bountyType: "wanted", maxReentries: 1 });

    expect(resolve({ player: { rebuys: 3 }, requestedDouble: true, settings })).toEqual({
      reentryDouble: true,
      usesReentry: true,
    });
    expect(
      resolve({ player: { doubleRebuys: 1, rebuys: 3 }, requestedDouble: true, settings }),
    ).toEqual({ reentryDouble: false, usesReentry: true });
  });

  it("keeps Progressive Bounty re-entries unlimited and its double unrestricted", () => {
    const settings = settingsWith({ bountyType: "progressive", maxReentries: 2 });

    expect(resolve({ player: { rebuys: 5 }, requestedDouble: true, settings })).toEqual({
      reentryDouble: true,
      usesReentry: true,
    });
    // Unlike Wanted Bounty, a second x2 is allowed in Progressive.
    expect(
      resolve({ player: { doubleRebuys: 1, rebuys: 5 }, requestedDouble: true, settings }),
    ).toEqual({ reentryDouble: true, usesReentry: true });
  });

  it("keeps the double available in the FREEROLL format", () => {
    expect(
      resolve({ requestedDouble: true, settings: settingsWith({ tournamentFormat: "freeroll" }) }),
    ).toEqual({ reentryDouble: true, usesReentry: true });
  });

  it("returns nothing when no re-entry was requested", () => {
    expect(resolve({ requestedDouble: true, requestedReentry: false })).toEqual({
      reentryDouble: false,
      usesReentry: false,
    });
  });
});
