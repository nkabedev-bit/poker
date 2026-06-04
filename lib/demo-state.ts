import type {
  BlindLevel,
  PublicTournamentState,
  TimerState,
  Tournament,
} from "@/lib/timer/types";

export const demoTournament: Tournament = {
  id: "demo",
  name: "POKER CLUB / DEMO",
  logoUrl: null,
  startingStack: 10000,
  registrationMinutes: 180,
  registrationStatus: "open",
  publicToken: "demo",
};

export const demoBlindLevels: BlindLevel[] = [
  {
    id: "demo-1",
    levelOrder: 1,
    smallBlind: 25,
    bigBlind: 50,
    ante: null,
    durationSeconds: 1200,
    isBreak: false,
    breakDurationSeconds: null,
  },
  {
    id: "demo-2",
    levelOrder: 2,
    smallBlind: 50,
    bigBlind: 100,
    ante: null,
    durationSeconds: 1200,
    isBreak: false,
    breakDurationSeconds: null,
  },
  {
    id: "demo-3",
    levelOrder: 3,
    smallBlind: 75,
    bigBlind: 150,
    ante: null,
    durationSeconds: 1200,
    isBreak: false,
    breakDurationSeconds: null,
  },
  {
    id: "demo-4",
    levelOrder: 4,
    smallBlind: 100,
    bigBlind: 200,
    ante: 25,
    durationSeconds: 1200,
    isBreak: false,
    breakDurationSeconds: null,
  },
  {
    id: "demo-break-1",
    levelOrder: 5,
    smallBlind: null,
    bigBlind: null,
    ante: null,
    durationSeconds: 600,
    isBreak: true,
    breakDurationSeconds: 600,
  },
  {
    id: "demo-6",
    levelOrder: 6,
    smallBlind: 150,
    bigBlind: 300,
    ante: 25,
    durationSeconds: 1200,
    isBreak: false,
    breakDurationSeconds: null,
  },
];

export const demoTimerState: TimerState = {
  status: "running",
  currentLevelIndex: 0,
  levelStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  pausedRemainingSeconds: null,
  registrationClosesAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  finishedAt: null,
};

export const demoPublicState: PublicTournamentState = {
  tournament: demoTournament,
  timerState: demoTimerState,
  blindLevels: demoBlindLevels,
};
