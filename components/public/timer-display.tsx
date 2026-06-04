import { formatClock, getLevelDuration } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

type TimerDisplayProps = {
  current: BlindLevel | null;
  next: BlindLevel | null;
  registrationStatus: "open" | "closed";
  remainingSeconds: number;
  roundNumber: number;
  secondsToBreak: number | null;
  timerState: TimerState;
};

function formatNumber(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("ru-RU");
}

function formatBreakClock(totalSeconds: number | null) {
  if (totalSeconds == null) return null;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");

  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export function TimerDisplay({
  current,
  next,
  remainingSeconds,
  roundNumber,
  secondsToBreak,
  timerState,
}: TimerDisplayProps) {
  const duration = getLevelDuration(current);
  const progress = duration > 0 ? 1 - remainingSeconds / duration : 0;
  const breakClock = formatBreakClock(secondsToBreak);
  const isRunning = timerState.status === "running" || timerState.status === "break";

  return (
    <section className="public-timer-panel">
      <div className="public-round-row">
        <strong>
          {current?.isBreak ? "ВРЕМЯ ПЕРЕРЫВА" : `РАУНД ${Math.max(1, roundNumber)}`}
        </strong>
        {breakClock ? (
          <span>
            <b>⏸</b> До перерыва: <strong>{breakClock}</strong>
          </span>
        ) : null}
      </div>
      <div className="timer-display" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        {formatClock(remainingSeconds)}
        {timerState.status === "paused" && (
          <span style={{ fontSize: "0.35em", color: "var(--color-gold)", fontWeight: "bold", padding: "4px 8px", border: "2px solid var(--color-gold)", borderRadius: "8px" }}>ПАУЗА</span>
        )}
      </div>
      <div className="public-progress">
        <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
      </div>
      <div className="public-progress-labels">
        <span>{isRunning ? "▶ Таймер идёт" : "⏸ На паузе"}</span>
        <span>{next?.isBreak ? "Следующий перерыв" : "Следующий уровень"}</span>
      </div>
      <div className="public-blinds-summary">
        <div>
          <p>Блайнды</p>
          {current?.isBreak ? (
            <strong className="public-break-title">ПЕРЕРЫВ</strong>
          ) : (
            <strong>
              <span>{formatNumber(current?.smallBlind)}</span>
              <i />
              <span>{formatNumber(current?.bigBlind)}</span>
              {(current?.ante ?? 0) > 0 ? <em>Анте: {formatNumber(current?.ante)}</em> : null}
            </strong>
          )}
        </div>
        <div>
          <p>Следующие</p>
          {next?.isBreak ? (
            <strong className="public-break-title">
              ⏸ ПЕРЕРЫВ
              <em>{Math.round(getLevelDuration(next) / 60)} минут</em>
            </strong>
          ) : (
            <strong>
              <span>{formatNumber(next?.smallBlind)}</span>
              <i />
              <span>{formatNumber(next?.bigBlind)}</span>
              {(next?.ante ?? 0) > 0 ? <em>Анте: {formatNumber(next?.ante)}</em> : null}
            </strong>
          )}
        </div>
      </div>
    </section>
  );
}
