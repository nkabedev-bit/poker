"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatClock, getEffectiveTimerState, isTournamentUnderway } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState, TimerStatus } from "@/lib/timer/types";

/**
 * Sent by the desk's pulse whenever it reloads a screen because something moved. The
 * clock reads the timer then, and only then: it never asks the server on a beat of its
 * own, so the clock in the header costs nothing while the room is quiet.
 */
export const TMA_DESK_CHANGED_EVENT = "tma:desk-changed";

type Clock = { levels: BlindLevel[]; timerState: TimerState };

type TimerRow = {
  current_level_index?: number | null;
  finished_at?: string | null;
  level_started_at?: string | null;
  paused_remaining_seconds?: number | null;
  registration_closes_at?: string | null;
  status?: TimerStatus | null;
} | null;

type LevelRow = {
  ante: number | null;
  big_blind: number | null;
  break_duration_seconds: number | null;
  double_reentry_available?: boolean | null;
  duration_seconds: number;
  id: string;
  is_break: boolean;
  level_order: number;
  reentry_closes?: boolean | null;
  small_blind: number | null;
};

// /api/tma/timer hands the rows over as the database keeps them.
function readClock(data: { blindLevels?: LevelRow[]; timerState?: TimerRow }): Clock {
  const row = data.timerState ?? null;

  return {
    levels: (data.blindLevels ?? []).map((level) => ({
      ante: level.ante,
      bigBlind: level.big_blind,
      breakDurationSeconds: level.break_duration_seconds,
      doubleReentryAvailable: Boolean(level.double_reentry_available),
      durationSeconds: level.duration_seconds,
      id: level.id,
      isBreak: level.is_break,
      levelOrder: level.level_order,
      reentryCloses: Boolean(level.reentry_closes),
      smallBlind: level.small_blind,
    })),
    timerState: {
      currentLevelIndex: row?.current_level_index ?? 0,
      finishedAt: row?.finished_at ?? null,
      levelStartedAt: row?.level_started_at ?? null,
      pausedRemainingSeconds: row?.paused_remaining_seconds ?? null,
      registrationClosesAt: row?.registration_closes_at ?? null,
      status: row?.status ?? "not_started",
    },
  };
}

type ClockContextValue = { clock: Clock | null; refresh: () => void };

const ClockContext = createContext<ClockContextValue>({ clock: null, refresh: () => {} });

/**
 * Keeps the tournament's timer for the header and the tournament screen.
 *
 * Read once when the app opens, again on every change the pulse sees, when the admin
 * switches tabs and when the phone wakes up. The seconds in between are counted on the
 * phone.
 */
export function TournamentClockProvider({
  children,
  initData,
  pathname,
}: {
  children: React.ReactNode;
  initData: string;
  pathname: string;
}) {
  const [clock, setClock] = useState<Clock | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tma/timer", {
        cache: "no-store",
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (!res.ok) return;
      setClock(readClock(await res.json()));
    } catch {
      // The header keeps the last clock it had; the next change brings a fresh one.
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [refresh, pathname]);

  useEffect(() => {
    const onChange = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener(TMA_DESK_CHANGED_EVENT, onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(TMA_DESK_CHANGED_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <ClockContext.Provider value={{ clock, refresh: () => void refresh() }}>
      {children}
    </ClockContext.Provider>
  );
}

export type ClockView = {
  /** Blinds as the room reads them, "200 / 400"; null on a break. */
  blinds: string | null;
  ante: number;
  isBreak: boolean;
  /** Playing levels only, the way the dealer counts them; breaks are not numbered. */
  levelNumber: number;
  levelsCount: number;
  /** What comes after this level: its blinds, or "перерыв". */
  next: string | null;
  remaining: string;
  /** How many playing levels are left before the next break, when one is coming. */
  levelsToBreak: number | null;
  status: TimerStatus;
};

function formatBlinds(level: BlindLevel | undefined) {
  if (!level || level.isBreak) return null;
  return `${(level.smallBlind ?? 0).toLocaleString("ru-RU")} / ${(level.bigBlind ?? 0).toLocaleString("ru-RU")}`;
}

function describeClock({ levels, timerState }: Clock, now: Date): ClockView {
  const { currentLevelIndex, remainingSeconds } = getEffectiveTimerState(timerState, levels, now);
  const current = levels[currentLevelIndex];
  const next = levels[currentLevelIndex + 1];
  const breakAhead = levels.findIndex((level, index) => index > currentLevelIndex && level.isBreak);

  return {
    ante: current?.ante ?? 0,
    blinds: formatBlinds(current),
    isBreak: Boolean(current?.isBreak),
    levelNumber: levels.slice(0, currentLevelIndex + 1).filter((level) => !level.isBreak).length,
    levelsCount: levels.filter((level) => !level.isBreak).length,
    levelsToBreak:
      breakAhead === -1
        ? null
        : levels.slice(currentLevelIndex + 1, breakAhead).filter((level) => !level.isBreak).length,
    next: next ? (next.isBreak ? "перерыв" : formatBlinds(next)) : null,
    remaining: formatClock(remainingSeconds),
    status: timerState.status,
  };
}

/** The clock as it stands this second; null until the timer has been read. */
export function useClockView(): ClockView | null {
  const { clock } = useContext(ClockContext);
  const [now, setNow] = useState(() => new Date());
  const ticking = clock?.timerState.status === "running" || clock?.timerState.status === "break";

  useEffect(() => {
    if (!ticking) return;
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [ticking]);

  return clock ? describeClock(clock, now) : null;
}

export function useRefreshClock() {
  return useContext(ClockContext).refresh;
}

const STATUS_WORDS: Record<TimerStatus, string> = {
  break: "Перерыв",
  finished: "Турнир завершён",
  not_started: "Турнир не начат",
  paused: "Пауза",
  running: "Идёт",
};

/**
 * The strip over the desk's working screens: the level, the blinds and the time left,
 * with the pause a tap away however deep in a screen the admin is.
 */
export function TournamentStatusBar({ onToggle }: { onToggle: (action: "pause" | "start") => void }) {
  const view = useClockView();
  if (!view) return null;

  const underway = isTournamentUnderway(view.status);
  const paused = view.status === "paused";
  const levelText = view.isBreak ? "Перерыв" : `Ур. ${view.levelNumber} · ${view.blinds ?? ""}`;

  return (
    <div className="tma-statusbar" role="status">
      <span
        className={`tma-statusbar__dot${
          paused ? " tma-statusbar__dot--paused" : underway ? " tma-statusbar__dot--running" : ""
        }`}
      />
      <div className="tma-statusbar__text">
        <div className="tma-statusbar__main">
          {underway ? (
            <>
              {levelText} ·{" "}
              <span className={`tma-statusbar__clock${paused ? " tma-statusbar__clock--paused" : ""}`}>
                {view.remaining}
              </span>
            </>
          ) : (
            STATUS_WORDS[view.status]
          )}
        </div>
        <div className="tma-statusbar__sub">
          {underway
            ? `${STATUS_WORDS[view.status]}${view.next ? ` · след. ${view.next}` : ""}`
            : view.status === "not_started" && view.blinds
              ? `Уровень 1 · ${view.blinds}`
              : ""}
        </div>
      </div>
      {underway ? (
        <button
          aria-label={paused ? "Продолжить" : "Пауза"}
          className="tma-icon-btn tma-icon-btn--round44"
          type="button"
          onClick={() => onToggle(paused ? "start" : "pause")}
        >
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
      ) : null}
    </div>
  );
}
