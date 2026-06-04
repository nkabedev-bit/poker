import { describe, expect, it } from "vitest";
import {
  getBlindAlertCue,
  getBlindAlertPlayback,
  getBlindAlertVolumeMultiplier,
} from "@/lib/timer/blind-alert";

describe("getBlindAlertCue", () => {
  it("returns a cue when running timer reaches the configured warning window", () => {
    expect(
      getBlindAlertCue({
        currentLevelIndex: 2,
        lastCueKey: null,
        nextLevelExists: true,
        remainingSeconds: 15,
        sound: "standard",
        status: "running",
        warningSeconds: 15,
      }),
    ).toBe("2:standard:15");
  });

  it("does not repeat a cue for the same level and settings", () => {
    expect(
      getBlindAlertCue({
        currentLevelIndex: 2,
        lastCueKey: "2:standard:15",
        nextLevelExists: true,
        remainingSeconds: 10,
        sound: "standard",
        status: "running",
        warningSeconds: 15,
      }),
    ).toBeNull();
  });

  it("does not cue when sound is disabled or there is no next level", () => {
    expect(
      getBlindAlertCue({
        currentLevelIndex: 2,
        lastCueKey: null,
        nextLevelExists: true,
        remainingSeconds: 15,
        sound: "off",
        status: "running",
        warningSeconds: 15,
      }),
    ).toBeNull();

    expect(
      getBlindAlertCue({
        currentLevelIndex: 2,
        lastCueKey: null,
        nextLevelExists: false,
        remainingSeconds: 15,
        sound: "standard",
        status: "running",
        warningSeconds: 15,
      }),
    ).toBeNull();
  });

  it("does not cue while timer is paused or not started", () => {
    expect(
      getBlindAlertCue({
        currentLevelIndex: 2,
        lastCueKey: null,
        nextLevelExists: true,
        remainingSeconds: 15,
        sound: "standard",
        status: "paused",
        warningSeconds: 15,
      }),
    ).toBeNull();
  });
});

describe("getBlindAlertPlayback", () => {
  it("uses uploaded custom audio when custom sound has a URL", () => {
    expect(getBlindAlertPlayback("custom", "/sounds/alert.mp3")).toEqual({
      kind: "custom",
      url: "/sounds/alert.mp3",
    });
  });

  it("falls back to standard generated sound when custom audio is missing", () => {
    expect(getBlindAlertPlayback("custom", null)).toEqual({
      kind: "generated",
      sound: "standard",
    });
  });
});

describe("getBlindAlertVolumeMultiplier", () => {
  it("maps the public 1-10 volume slider to a boosted alert gain range", () => {
    expect(getBlindAlertVolumeMultiplier(1)).toBeCloseTo(1.2);
    expect(getBlindAlertVolumeMultiplier(7)).toBeCloseTo(4.733333);
    expect(getBlindAlertVolumeMultiplier(10)).toBeCloseTo(6.5);
  });

  it("keeps out-of-range slider values inside the boosted gain range", () => {
    expect(getBlindAlertVolumeMultiplier(0)).toBeCloseTo(1.2);
    expect(getBlindAlertVolumeMultiplier(11)).toBeCloseTo(6.5);
  });
});
