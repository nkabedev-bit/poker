import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  BlindLevel,
  PublicTournamentState,
  TimerState,
  Tournament,
} from "@/lib/timer/types";

type PublicStateRpc = {
  tournament: {
    id: string;
    name: string;
    logo_url: string | null;
    starting_stack: number;
    registration_minutes: number;
    registration_status: "open" | "closed";
    public_token: string;
  };
  timerState: {
    status: TimerState["status"];
    current_level_index: number;
    level_started_at: string | null;
    paused_remaining_seconds: number | null;
    registration_closes_at: string | null;
    finished_at: string | null;
  };
  blindLevels: Array<{
    id: string;
    level_order: number;
    small_blind: number | null;
    big_blind: number | null;
    ante: number | null;
    duration_seconds: number;
    is_break: boolean;
    break_duration_seconds: number | null;
  }>;
};

function mapTournament(row: PublicStateRpc["tournament"]): Tournament {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    startingStack: row.starting_stack,
    registrationMinutes: row.registration_minutes,
    registrationStatus: row.registration_status,
    publicToken: row.public_token,
  };
}

function mapTimerState(row: PublicStateRpc["timerState"]): TimerState {
  return {
    status: row.status,
    currentLevelIndex: row.current_level_index,
    levelStartedAt: row.level_started_at,
    pausedRemainingSeconds: row.paused_remaining_seconds,
    registrationClosesAt: row.registration_closes_at,
    finishedAt: row.finished_at,
  };
}

function mapBlindLevel(row: PublicStateRpc["blindLevels"][number]): BlindLevel {
  return {
    id: row.id,
    levelOrder: row.level_order,
    smallBlind: row.small_blind,
    bigBlind: row.big_blind,
    ante: row.ante,
    durationSeconds: row.duration_seconds,
    isBreak: row.is_break,
    breakDurationSeconds: row.break_duration_seconds,
  };
}

export async function loadPublicState(
  token: string,
): Promise<PublicTournamentState | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("get_public_state", { token });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const state = data as PublicStateRpc;

  return {
    tournament: mapTournament(state.tournament),
    timerState: mapTimerState(state.timerState),
    blindLevels: state.blindLevels.map(mapBlindLevel),
  };
}
