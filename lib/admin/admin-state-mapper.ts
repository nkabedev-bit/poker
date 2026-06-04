import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type {
  BlindLevel,
  PublicTournamentState,
  RegistrationStatus,
  TimerState,
  TimerStatus,
  Tournament,
} from "@/lib/timer/types";

export type AdminStateRpc = {
  tournament: {
    id: string;
    logo_url: string | null;
    name: string;
    public_token: string;
    registration_minutes: number;
    registration_status: RegistrationStatus;
    starting_stack: number;
  };
  timerState: {
    current_level_index: number;
    finished_at: string | null;
    level_started_at: string | null;
    paused_remaining_seconds: number | null;
    registration_closes_at: string | null;
    status: TimerStatus;
  } | null;
  blindLevels: Array<{
    ante: number | null;
    big_blind: number | null;
    break_duration_seconds: number | null;
    duration_seconds: number;
    id: string;
    is_break: boolean;
    level_order: number;
    reentry_closes?: boolean | null;
    small_blind: number | null;
  }>;
  extras: unknown;
};

function mapTournament(row: AdminStateRpc["tournament"]): Tournament {
  return {
    id: row.id,
    logoUrl: row.logo_url,
    name: row.name,
    publicToken: row.public_token,
    registrationMinutes: row.registration_minutes,
    registrationStatus: row.registration_status,
    startingStack: row.starting_stack,
  };
}

function mapTimerState(row: AdminStateRpc["timerState"]): TimerState {
  return {
    currentLevelIndex: row?.current_level_index ?? 0,
    finishedAt: row?.finished_at ?? null,
    levelStartedAt: row?.level_started_at ?? null,
    pausedRemainingSeconds: row?.paused_remaining_seconds ?? null,
    registrationClosesAt: row?.registration_closes_at ?? null,
    status: row?.status ?? "not_started",
  };
}

function mapBlindLevel(row: AdminStateRpc["blindLevels"][number]): BlindLevel {
  return {
    ante: row.ante,
    bigBlind: row.big_blind,
    breakDurationSeconds: row.break_duration_seconds,
    durationSeconds: row.duration_seconds,
    id: row.id,
    isBreak: row.is_break,
    levelOrder: row.level_order,
    reentryCloses: Boolean(row.reentry_closes),
    smallBlind: row.small_blind,
  };
}

export function mapAdminStateRpc(row: AdminStateRpc): PublicTournamentState {
  return {
    blindLevels: row.blindLevels.map(mapBlindLevel),
    extras: mergeTournamentExtras(row.extras),
    timerState: mapTimerState(row.timerState),
    tournament: mapTournament(row.tournament),
  };
}
