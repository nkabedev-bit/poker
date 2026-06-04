/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  getRotatingPublicTableNumbers,
  getGeneratedBlindAlertAudioUrl,
  getPublicSoundIcon,
} from "@/components/public/public-screen";
import type { TournamentPlayer } from "@/lib/timer/types";

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
