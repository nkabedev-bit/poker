import type { CSSProperties } from "react";
import { TIMER_FONT_CLASSES } from "@/components/public/timer-fonts";
import { formatClock, getLevelDuration } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState, TimerStatus } from "@/lib/timer/types";

type TimerDisplayProps = {
  current: BlindLevel | null;
  next: BlindLevel | null;
  remainingSeconds: number;
  roundNumber: number;
  /** Every level that is played, breaks left out — the "из 24" next to the level. */
  roundsCount: number;
  secondsToBreak: number | null;
  timerState: TimerState;
};

const STATUS_LABELS: Record<TimerStatus, string> = {
  break: "Идёт",
  finished: "Завершён",
  not_started: "Ожидание",
  paused: "На паузе",
  running: "Идёт",
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

function countDigits(text: string) {
  return text.replace(/\D/g, "").length;
}

/**
 * How tall the blinds stand, in the board's units. The longer number of the pair decides:
 * both have to fit side by side across the card, five digits apiece included.
 */
function blindSize(smallBlind: string, bigBlind: string) {
  const digits = Math.max(countDigits(smallBlind), countDigits(bigBlind));
  if (digits <= 2) return 380;
  if (digits === 3) return 340;
  // Thousands carry a space the drawing did not have, hence a step below it from here.
  if (digits === 4) return 260;
  if (digits === 5) return 210;
  return 180;
}

/** The next level shares its card with a label, so it steps down sooner. */
function nextSize(smallBlind: string, bigBlind: string) {
  const digits = countDigits(smallBlind) + countDigits(bigBlind);
  if (digits <= 4) return 92;
  if (digits <= 7) return 76;
  if (digits <= 9) return 60;
  return 50;
}

function sizeStyle(name: string, size: number) {
  return { [name]: size } as CSSProperties;
}

/**
 * The centre of the hall screen: the level and the time to the break on top, the blinds
 * filling the middle, the clock and the next level underneath.
 *
 * Drawn on a 1220 × 992 board and scaled as one piece to whatever room the centre column
 * has, so the proportions hold from a laptop to a television.
 */
export function TimerDisplay({
  current,
  next,
  remainingSeconds,
  roundNumber,
  roundsCount,
  secondsToBreak,
  timerState,
}: TimerDisplayProps) {
  const duration = getLevelDuration(current);
  const progress = duration > 0 ? Math.max(0, Math.min(1, 1 - remainingSeconds / duration)) : 0;
  const breakClock = formatBreakClock(secondsToBreak);
  const isBreak = Boolean(current?.isBreak);
  const isTicking = timerState.status === "running" || timerState.status === "break";
  const smallBlind = formatNumber(current?.smallBlind);
  const bigBlind = formatNumber(current?.bigBlind);
  const ante = (current?.ante ?? 0) > 0 ? formatNumber(current?.ante) : null;
  const nextSmallBlind = formatNumber(next?.smallBlind);
  const nextBigBlind = formatNumber(next?.bigBlind);

  return (
    <section className={`tc ${TIMER_FONT_CLASSES}`}>
      <div className="tc__top">
        {isBreak ? (
          <span className="tc__level-label tc__level-label--break">Перерыв</span>
        ) : (
          <div className="tc__level">
            <span className="tc__level-label">Уровень</span>
            <span className="tc__level-number">{Math.max(1, roundNumber)}</span>
            {roundsCount > 0 ? <span className="tc__level-label">из {roundsCount}</span> : null}
          </div>
        )}
        {breakClock ? (
          <div className="tc__break-in">
            <span>До перерыва</span>
            <strong>{breakClock}</strong>
          </div>
        ) : null}
      </div>

      <div className="tc__blinds">
        {isBreak ? (
          <>
            <div className="tc__blinds-title">Время перерыва</div>
            <strong className="tc__break-title">Перерыв</strong>
          </>
        ) : (
          <>
            <div className="tc__blinds-title">Блайнды</div>
            <div className="tc__blinds-row" style={sizeStyle("--blind-size", blindSize(smallBlind, bigBlind))}>
              <div className="tc__blind">
                <strong>{smallBlind}</strong>
                <span>Малый</span>
              </div>
              <span className="tc__slash">/</span>
              <div className="tc__blind">
                <strong>{bigBlind}</strong>
                <span>Большой</span>
              </div>
            </div>
            {ante ? (
              <div className="tc__ante">
                <span>Анте</span>
                <strong>{ante}</strong>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="tc__bottom">
        <div className="tc__clock">
          <div className="tc__clock-row">
            <strong className={isTicking ? "tc__time" : "tc__time tc__time--idle"}>
              {formatClock(remainingSeconds)}
            </strong>
            <span className={`tc__status tc__status--${isTicking ? "running" : timerState.status}`}>
              {STATUS_LABELS[timerState.status]}
            </span>
          </div>
          <div className="tc__progress">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className="tc__next">
          <span className="tc__next-label">{next?.isBreak ? "Далее перерыв" : "Следующие"}</span>
          {!next ? (
            <strong className="tc__next-value" style={sizeStyle("--next-size", 92)}>
              —
            </strong>
          ) : next.isBreak ? (
            <strong className="tc__next-value" style={sizeStyle("--next-size", 92)}>
              {Math.round(getLevelDuration(next) / 60)}
              <small>мин</small>
            </strong>
          ) : (
            <>
              <strong
                className="tc__next-value"
                style={sizeStyle("--next-size", nextSize(nextSmallBlind, nextBigBlind))}
              >
                {nextSmallBlind} / {nextBigBlind}
              </strong>
              {(next.ante ?? 0) > 0 ? (
                <span className="tc__next-ante">Анте {formatNumber(next.ante)}</span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
