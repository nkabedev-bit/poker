export type TimerStatus =
  | "not_started"
  | "running"
  | "paused"
  | "break"
  | "finished";

export type RegistrationStatus = "open" | "closed";

export type BlindLevel = {
  id: string;
  levelOrder: number;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  durationSeconds: number;
  isBreak: boolean;
  breakDurationSeconds: number | null;
};

export type Tournament = {
  id: string;
  name: string;
  logoUrl: string | null;
  startingStack: number;
  registrationMinutes: number;
  registrationStatus: RegistrationStatus;
  publicToken: string;
};

export type TimerState = {
  status: TimerStatus;
  currentLevelIndex: number;
  levelStartedAt: string | null;
  pausedRemainingSeconds: number | null;
  registrationClosesAt: string | null;
  finishedAt: string | null;
};

export type PublicTournamentState = {
  tournament: Tournament;
  timerState: TimerState;
  blindLevels: BlindLevel[];
};
