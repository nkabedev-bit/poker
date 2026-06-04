import type { BlindLevel, TimerState } from "@/lib/timer/types";

export function getLevelDuration(level: BlindLevel | null): number {
  if (!level) return 0;
  if (level.isBreak) return level.breakDurationSeconds ?? level.durationSeconds;
  return level.durationSeconds;
}

export function getEffectiveTimerState(
  state: TimerState,
  levels: BlindLevel[],
  now: Date,
): { currentLevelIndex: number; remainingSeconds: number } {
  if (state.status === "finished") {
    return { currentLevelIndex: state.currentLevelIndex, remainingSeconds: 0 };
  }
  
  if (state.status === "paused") {
    const duration = getLevelDuration(levels[state.currentLevelIndex]);
    return {
      currentLevelIndex: state.currentLevelIndex,
      remainingSeconds: Math.max(0, state.pausedRemainingSeconds ?? duration),
    };
  }

  if (state.status === "not_started" || !state.levelStartedAt) {
    const duration = getLevelDuration(levels[state.currentLevelIndex]);
    return {
      currentLevelIndex: state.currentLevelIndex,
      remainingSeconds: Math.max(0, duration),
    };
  }

  const startedAt = new Date(state.levelStartedAt).getTime();
  let elapsedSeconds = Math.floor((now.getTime() - startedAt) / 1000);
  
  if (elapsedSeconds < 0) elapsedSeconds = 0;

  let currentIndex = state.currentLevelIndex;
  
  while (currentIndex < levels.length) {
    const duration = getLevelDuration(levels[currentIndex]);
    if (elapsedSeconds < duration) {
      return {
        currentLevelIndex: currentIndex,
        remainingSeconds: duration - elapsedSeconds,
      };
    }
    elapsedSeconds -= duration;
    currentIndex++;
  }
  
  return {
    currentLevelIndex: Math.max(0, levels.length - 1),
    remainingSeconds: 0,
  };
}

export function isReentryAvailable(
  state: TimerState,
  levels: BlindLevel[],
  now: Date,
): boolean {
  if (state.status === "finished") return false;

  const cutoffIndex = levels.findIndex((level) => !level.isBreak && level.reentryCloses);
  if (cutoffIndex === -1) return true;

  const { currentLevelIndex } = getEffectiveTimerState(state, levels, now);
  return currentLevelIndex < cutoffIndex;
}

export function calculateRemainingSeconds(
  state: TimerState,
  levels: BlindLevel[],
  now: Date,
): number {
  return getEffectiveTimerState(state, levels, now).remainingSeconds;
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
