import type { BlindLevel, TimerState } from "@/lib/timer/types";

export function getLevelDuration(level: BlindLevel | null): number {
  if (!level) return 0;
  if (level.isBreak) return level.breakDurationSeconds ?? level.durationSeconds;
  return level.durationSeconds;
}

export function calculateRemainingSeconds(
  state: TimerState,
  levels: BlindLevel[],
  now: Date,
): number {
  const current = levels[state.currentLevelIndex] ?? null;
  const duration = getLevelDuration(current);

  if (state.status === "finished") return 0;
  if (state.status === "paused") {
    return Math.max(0, state.pausedRemainingSeconds ?? duration);
  }
  if (state.status === "not_started" || !state.levelStartedAt) return duration;

  const startedAt = new Date(state.levelStartedAt).getTime();
  const elapsedSeconds = Math.floor((now.getTime() - startedAt) / 1000);

  return Math.max(0, duration - elapsedSeconds);
}

export function getCurrentAndNextLevel(
  levels: BlindLevel[],
  currentLevelIndex: number,
) {
  return {
    current: levels[currentLevelIndex] ?? null,
    next: levels[currentLevelIndex + 1] ?? null,
  };
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}
