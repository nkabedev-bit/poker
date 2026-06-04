"use client";

import { useEffect, useState } from "react";
import { getEffectiveTimerState, formatClock } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

type AdminTimerClockProps = {
  timerState: TimerState;
  blindLevels: BlindLevel[];
};

export function AdminTimerClock({ timerState, blindLevels }: AdminTimerClockProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (timerState.status !== "running" && timerState.status !== "break") {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [timerState.status]);

  const { remainingSeconds } = getEffectiveTimerState(timerState, blindLevels, now);

  return (
    <div className="admin-timer-clock" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
      {formatClock(remainingSeconds)}
      {timerState.status === "paused" && (
        <span style={{ fontSize: "0.35em", color: "var(--color-gold)", fontWeight: "bold", padding: "4px 8px", border: "2px solid var(--color-gold)", borderRadius: "8px" }}>ПАУЗА</span>
      )}
    </div>
  );
}
