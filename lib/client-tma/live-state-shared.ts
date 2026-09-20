import type { TimerLevel, TimerState, TimerStatus } from "@/lib/timer/types";

/**
 * A blind level as a phone needs it: enough to draw the round and count it down, and
 * nothing about re-entry rules, which the desk decides and the player only hears about.
 */
export type LiveBlindLevel = TimerLevel & {
  ante: number | null;
  bigBlind: number | null;
  levelOrder: number;
  smallBlind: number | null;
};

/** What the club's players see of a game under way. No stacks, no names — just the room. */
export type ClientLiveState = {
  activePlayers: number;
  /** Sent on the first load only; a phone keeps the grid and re-reads it by version. */
  blindLevels: LiveBlindLevel[] | null;
  currentLevelIndex: number;
  levelStartedAt: string | null;
  /** Moves when the levels are edited, which is the phone's cue to fetch them again. */
  levelsVersion: string;
  pausedRemainingSeconds: number | null;
  registrationClosesAt: string | null;
  status: TimerStatus;
  totalPlayers: number;
  tournamentName: string;
};

/**
 * The timer as the phone should read it, given the state it holds.
 *
 * Shaped like the screen's own timer state so the same countdown maths serves both.
 */
export function toTimerState(state: ClientLiveState): TimerState {
  return {
    currentLevelIndex: state.currentLevelIndex,
    finishedAt: null,
    levelStartedAt: state.levelStartedAt,
    pausedRemainingSeconds: state.pausedRemainingSeconds,
    registrationClosesAt: state.registrationClosesAt,
    status: state.status,
  };
}
