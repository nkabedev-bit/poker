import type { BlindAlertSound, TimerStatus } from "@/lib/timer/types";

export const blindAlertSounds = ["standard", "double", "chime", "custom", "off"] as const;

export type BlindAlertSettings = {
  sound: BlindAlertSound;
  warningSeconds: number;
};

type BlindAlertCueInput = {
  currentLevelIndex: number;
  lastCueKey: string | null;
  nextLevelExists: boolean;
  remainingSeconds: number;
  sound: BlindAlertSound;
  status: TimerStatus;
  warningSeconds: number;
};

export const defaultBlindAlertSettings: BlindAlertSettings = {
  sound: "standard",
  warningSeconds: 10,
};

export function isBlindAlertSound(value: unknown): value is BlindAlertSound {
  return typeof value === "string" && blindAlertSounds.includes(value as BlindAlertSound);
}

export function normalizeBlindAlertSeconds(value: number) {
  if (!Number.isFinite(value)) return defaultBlindAlertSettings.warningSeconds;
  return Math.max(1, Math.min(300, Math.round(value)));
}

export function getBlindAlertVolumeMultiplier(volume: number) {
  const normalizedVolume = Math.max(1, Math.min(10, Math.round(volume)));
  return 1.2 + ((normalizedVolume - 1) / 9) * 5.3;
}

export function getBlindAlertCue({
  currentLevelIndex,
  lastCueKey,
  nextLevelExists,
  remainingSeconds,
  sound,
  status,
  warningSeconds,
}: BlindAlertCueInput) {
  if (sound === "off" || !nextLevelExists) return null;
  if (status !== "running" && status !== "break") return null;

  const normalizedSeconds = normalizeBlindAlertSeconds(warningSeconds);
  if (remainingSeconds <= 0 || remainingSeconds > normalizedSeconds) return null;

  const cueKey = `${currentLevelIndex}:${sound}:${normalizedSeconds}`;
  return cueKey === lastCueKey ? null : cueKey;
}

export function getBlindAlertPlayback(
  sound: BlindAlertSound,
  customSoundUrl: string | null | undefined,
) {
  if (sound === "off") return null;
  if (sound === "custom") {
    return customSoundUrl
      ? { kind: "custom" as const, url: customSoundUrl }
      : { kind: "generated" as const, sound: "standard" as const };
  }

  return { kind: "generated" as const, sound };
}
