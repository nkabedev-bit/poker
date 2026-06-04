import { demoBlindLevels, demoTimerState, demoTournament } from "@/lib/demo-state";
import { hasPublicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { calculateRemainingSeconds, formatClock } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState, Tournament } from "@/lib/timer/types";

export const dynamic = "force-dynamic";

export default async function TournamentStatePage() {
  const state = await loadTournamentState();
  const current = state.blindLevels[state.timerState.currentLevelIndex] ?? null;
  const next = state.blindLevels[state.timerState.currentLevelIndex + 1] ?? null;
  const remaining = calculateRemainingSeconds(
    state.timerState,
    state.blindLevels,
    new Date(),
  );

  return (
    <main className="state-page">
      <section className="poker-panel state-panel">
        <div>
          <p className="eyebrow">🏆 Состояние турнира</p>
          <h1>{state.tournament.name}</h1>
        </div>
        <div className="state-clock">{formatClock(remaining)}</div>
        <div className="state-grid">
          <StateItem label="Статус таймера" value={state.timerState.status} />
          <StateItem label="Регистрация" value={state.tournament.registrationStatus} />
          <StateItem label="Текущий уровень" value={formatBlinds(current)} />
          <StateItem label="Следующий уровень" value={formatBlinds(next)} />
          <StateItem
            label="Стартовый стек"
            value={state.tournament.startingStack.toLocaleString("ru-RU")}
          />
          <StateItem label="Публичный токен" value={state.tournament.publicToken} />
        </div>
      </section>
    </main>
  );
}

function StateItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="state-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatBlinds(level: BlindLevel | null) {
  if (!level) return "—";
  if (level.isBreak) return "Перерыв";
  return `${level.smallBlind} / ${level.bigBlind}`;
}

async function loadTournamentState(): Promise<{
  tournament: Tournament;
  timerState: TimerState;
  blindLevels: BlindLevel[];
}> {
  if (!hasPublicEnv()) {
    return {
      tournament: demoTournament,
      timerState: demoTimerState,
      blindLevels: demoBlindLevels,
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, logo_url, starting_stack, registration_minutes, registration_status, public_token")
    .limit(1)
    .single();

  if (!tournament) {
    return {
      tournament: demoTournament,
      timerState: demoTimerState,
      blindLevels: demoBlindLevels,
    };
  }

  const { data: timerState } = await supabase
    .from("timer_state")
    .select("status, current_level_index, level_started_at, paused_remaining_seconds, registration_closes_at, finished_at")
    .eq("tournament_id", tournament.id)
    .single();

  const { data: blindLevels } = await supabase
    .from("blind_levels")
    .select("id, level_order, small_blind, big_blind, ante, reentry_closes, duration_seconds, is_break, break_duration_seconds")
    .eq("tournament_id", tournament.id)
    .order("level_order", { ascending: true });

  return {
    tournament: {
      id: tournament.id as string,
      name: tournament.name as string,
      logoUrl: tournament.logo_url as string | null,
      startingStack: tournament.starting_stack as number,
      registrationMinutes: tournament.registration_minutes as number,
      registrationStatus: tournament.registration_status as Tournament["registrationStatus"],
      publicToken: tournament.public_token as string,
    },
    timerState: {
      status: (timerState?.status as TimerState["status"]) ?? "not_started",
      currentLevelIndex: (timerState?.current_level_index as number) ?? 0,
      levelStartedAt: (timerState?.level_started_at as string | null) ?? null,
      pausedRemainingSeconds:
        (timerState?.paused_remaining_seconds as number | null) ?? null,
      registrationClosesAt:
        (timerState?.registration_closes_at as string | null) ?? null,
      finishedAt: (timerState?.finished_at as string | null) ?? null,
    },
    blindLevels: (blindLevels ?? []).map((level) => ({
      id: level.id as string,
      levelOrder: level.level_order as number,
      smallBlind: level.small_blind as number | null,
      bigBlind: level.big_blind as number | null,
      ante: level.ante as number | null,
      reentryCloses: Boolean(level.reentry_closes),
      durationSeconds: level.duration_seconds as number,
      isBreak: level.is_break as boolean,
      breakDurationSeconds: level.break_duration_seconds as number | null,
    })),
  };
}
