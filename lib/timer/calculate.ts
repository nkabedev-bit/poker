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

// The current level's big blind, falling back to the nearest non-break level when the
// timer sits on a break (or on a level without blinds configured).
export function resolveEffectiveBigBlind(levels: BlindLevel[], currentIndex: number): number {
  const currentLevel = levels[currentIndex];
  const currentBigBlind = currentLevel && !currentLevel.isBreak ? currentLevel.bigBlind : null;

  if (currentBigBlind && currentBigBlind > 0) {
    return currentBigBlind;
  }

  for (let index = currentIndex - 1; index >= 0; index--) {
    const level = levels[index];
    if (!level?.isBreak && level?.bigBlind && level.bigBlind > 0) {
      return level.bigBlind;
    }
  }

  for (let index = currentIndex + 1; index < levels.length; index++) {
    const level = levels[index];
    if (!level?.isBreak && level?.bigBlind && level.bigBlind > 0) {
      return level.bigBlind;
    }
  }

  return 0;
}

export function getBountyChipAward(
  levels: BlindLevel[],
  currentLevelIndex: number,
): number {
  const currentIndex = Math.max(0, Math.trunc(currentLevelIndex));
  const lastBreakIndex = levels.findLastIndex((level) => level.isBreak);
  const multiplier = lastBreakIndex !== -1 && currentIndex > lastBreakIndex ? 1 : 2;
  return resolveEffectiveBigBlind(levels, currentIndex) * multiplier;
}

// Wanted Bounty stack reward, regardless of breaks: three current big blinds for
// knocking out a wanted player (someone who already re-entered), two for a regular one.
export function getWantedBountyChipAward(
  levels: BlindLevel[],
  currentLevelIndex: number,
  isWantedVictim: boolean,
): number {
  const bigBlind = resolveEffectiveBigBlind(levels, Math.max(0, Math.trunc(currentLevelIndex)));
  return bigBlind * (isWantedVictim ? 3 : 2);
}

// Dealer Revenge stack reward, regardless of breaks: three current big blinds for
// knocking out the dealer. Regular knockouts leave the killer's stack untouched.
export function getDealerKnockoutChipAward(
  levels: BlindLevel[],
  currentLevelIndex: number,
): number {
  return resolveEffectiveBigBlind(levels, Math.max(0, Math.trunc(currentLevelIndex))) * 3;
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}
