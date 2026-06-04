/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  getPublicChipBankTotal,
  getPublicPlayerBadges,
  getRotatingPublicTableNumbers,
  getGeneratedBlindAlertAudioUrl,
  getPublicSoundIcon,
} from "@/components/public/public-screen";
import { defaultTournamentExtras } from "@/lib/tournament-extras-shared";
import type { PublicTournamentState, TournamentPlayer } from "@/lib/timer/types";

function player(
  id: string,
  table: number | null,
  status: TournamentPlayer["status"] = "active",
): TournamentPlayer {
  return {
    id,
    name: id,
    stack: 1000,
    table,
    seat: null,
    rebuys: 0,
    addons: 0,
    bountyCount: 0,
    status,
    finishPlace: null,
  };
}

describe("getPublicSoundIcon", () => {
  it("shows muted until browser audio is unlocked", () => {
    expect(
      getPublicSoundIcon({
        sound: "standard",
        soundEnabled: true,
        soundReady: false,
        volume: 7,
      }),
    ).toBe("🔇");
  });

  it("shows volume only when sound is enabled and ready", () => {
    expect(
      getPublicSoundIcon({
        sound: "standard",
        soundEnabled: true,
        soundReady: true,
        volume: 7,
      }),
    ).toBe("🔊");
  });

  it("shows muted when disabled in either public screen or settings", () => {
    expect(
      getPublicSoundIcon({
        sound: "standard",
        soundEnabled: false,
        soundReady: true,
        volume: 7,
      }),
    ).toBe("🔇");

    expect(
      getPublicSoundIcon({
        sound: "off",
        soundEnabled: true,
        soundReady: true,
        volume: 7,
      }),
    ).toBe("🔇");
  });
});

describe("getGeneratedBlindAlertAudioUrl", () => {
  it("creates a playable wav data URL for generated sounds", () => {
    const url = getGeneratedBlindAlertAudioUrl("standard");

    expect(url).toMatch(/^data:audio\/wav;base64,/);
    expect(url.length).toBeGreaterThan(1000);
  });
});

describe("getRotatingPublicTableNumbers", () => {
  it("skips tables without active players", () => {
    expect(
      getRotatingPublicTableNumbers(
        [
          player("table-1", 1),
          player("table-2-out", 2, "eliminated"),
          player("table-3-a", 3),
          player("table-3-b", 3),
        ],
        3,
      ),
    ).toEqual([1, 3]);
  });
});

describe("getPublicPlayerBadges", () => {
  it("shows earned bounty and hides zero re-entry count", () => {
    expect(getPublicPlayerBadges({ bountyCount: 1.5, rebuys: 0 }, true)).toEqual(["💰 1,5"]);
  });

  it("hides zero bounty and shows re-entry count only after player used it", () => {
    expect(getPublicPlayerBadges({ bountyCount: 0, rebuys: 2 }, true)).toEqual(["🎟️ 2"]);
    expect(getPublicPlayerBadges({ bountyCount: 0, rebuys: 2 }, false)).toEqual(["🎟️ 2"]);
    expect(getPublicPlayerBadges({ bountyCount: 0, rebuys: 0 }, true)).toEqual([]);
  });
});

describe("getPublicChipBankTotal", () => {
  it("adds bounty chips awarded for eliminations to the public chip bank", () => {
    const state: PublicTournamentState = {
      tournament: {
        id: "tournament-1",
        logoUrl: null,
        name: "Poker",
        publicToken: "token",
        registrationMinutes: 60,
        registrationStatus: "open",
        startingStack: 1000,
      },
      timerState: {
        currentLevelIndex: 0,
        finishedAt: null,
        levelStartedAt: null,
        pausedRemainingSeconds: null,
        registrationClosesAt: null,
        status: "not_started",
      },
      blindLevels: [],
      extras: {
        ...defaultTournamentExtras,
        players: [
          { ...player("a", 1), bountyChipsTotal: 200 },
          { ...player("b", 1), rebuys: 1 },
          { ...player("c", 1), addonChipsTotal: 150 },
        ],
      },
    };

    expect(getPublicChipBankTotal(state)).toBe(4350);
  });
});
