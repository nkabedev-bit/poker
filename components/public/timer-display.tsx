import { formatClock, getLevelDuration } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

type TimerDisplayProps = {
  current: BlindLevel | null;
  next: BlindLevel | null;
  registrationStatus: "open" | "closed";
  remainingSeconds: number;
  timerState: TimerState;
};

function formatBlinds(level: BlindLevel | null) {
  if (!level) return "—";
  if (level.isBreak) return "Перерыв";
  return `${level.smallBlind} / ${level.bigBlind}`;
}

function statusLabel(status: TimerState["status"]) {
  if (status === "running") return "Таймер идет";
  if (status === "paused") return "Пауза";
  if (status === "break") return "Перерыв";
  if (status === "finished") return "Турнир завершен";
  return "До старта";
}

export function TimerDisplay({
  current,
  next,
  registrationStatus,
  remainingSeconds,
  timerState,
}: TimerDisplayProps) {
  const duration = getLevelDuration(current);
  const progress = duration > 0 ? 1 - remainingSeconds / duration : 0;

  return (
    <section className="public-timer-panel">
      <div className="status-row">
        <span className="status-chip">{statusLabel(timerState.status)}</span>
        <span className="status-chip green">
          Регистрация {registrationStatus === "open" ? "открыта" : "закрыта"}
        </span>
      </div>
      <div className="timer-display">{formatClock(remainingSeconds)}</div>
      <div className="public-progress">
        <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
      </div>
      <div className="public-blinds-summary">
        <div>
          <p>Блайнды</p>
          <strong>{formatBlinds(current)}</strong>
        </div>
        <div>
          <p>Следующие</p>
          <strong>{formatBlinds(next)}</strong>
        </div>
      </div>
    </section>
  );
}
