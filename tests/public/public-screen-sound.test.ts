/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  getGeneratedBlindAlertAudioUrl,
  getPublicSoundIcon,
} from "@/components/public/public-screen";

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
