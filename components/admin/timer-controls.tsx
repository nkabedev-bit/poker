import {
  closeRegistration,
  finishTournament,
  nextLevel,
  pauseTimer,
  previousLevel,
  resumeTimer,
  startTimer,
} from "@/app/admin/timer/actions";
import { calculateRemainingSeconds, formatClock } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

type TimerControlsProps = {
  blindLevels: BlindLevel[];
  timerState: TimerState;
  registrationStatus: "open" | "closed";
};

function formatBlinds(level: BlindLevel | null) {
  if (!level) return "—";
  if (level.isBreak) return "Перерыв";
  return `${level.smallBlind} / ${level.bigBlind}`;
}

export function TimerControls({
  blindLevels,
  timerState,
  registrationStatus,
}: TimerControlsProps) {
  const current = blindLevels[timerState.currentLevelIndex] ?? null;
  const next = blindLevels[timerState.currentLevelIndex + 1] ?? null;
  const remaining = calculateRemainingSeconds(timerState, blindLevels, new Date());
  const isRunning = timerState.status === "running" || timerState.status === "break";

  return (
    <div className="timer-admin-grid">
      <section className="poker-panel timer-control-panel">
        <p className="eyebrow">Уровень {timerState.currentLevelIndex + 1}</p>
        <div className="admin-blinds-current">{formatBlinds(current)}</div>
        <div className="admin-timer-clock">{formatClock(remaining)}</div>
        <div className="button-row centered">
          <form action={previousLevel}>
            <button className="ghost-button" type="submit">
              Пред. уровень
            </button>
          </form>
          {isRunning ? (
            <form action={pauseTimer}>
              <button className="gold-outline-button" type="submit">
                Пауза
              </button>
            </form>
          ) : timerState.status === "paused" ? (
            <form action={resumeTimer}>
              <button className="gold-button" type="submit">
                Продолжить
              </button>
            </form>
          ) : (
            <form action={startTimer}>
              <button className="gold-button" type="submit">
                Старт
              </button>
            </form>
          )}
          <form action={nextLevel}>
            <button className="ghost-button" type="submit">
              След. уровень
            </button>
          </form>
          <form action={closeRegistration}>
            <button className="green-button" disabled={registrationStatus === "closed"} type="submit">
              Закрыть регистрацию
            </button>
          </form>
          <form action={finishTournament}>
            <button className="red-button" type="submit">
              Завершить турнир
            </button>
          </form>
        </div>
      </section>
      <section className="poker-panel timer-summary">
        <h2>Следующий уровень</h2>
        <div className="next-blinds">{formatBlinds(next)}</div>
        <p className="muted">
          Регистрация: {registrationStatus === "open" ? "открыта" : "закрыта"}
        </p>
        <p className="muted">Статус таймера: {timerState.status}</p>
      </section>
    </div>
  );
}
