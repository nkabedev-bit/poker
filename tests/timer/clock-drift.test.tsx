/**
 * @vitest-environment jsdom
 */
import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTimerClock } from "@/components/admin/admin-timer-clock";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

describe("AdminTimerClock Drift Correction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adjusts timer display based on clock drift offset", () => {
    // Simulated Server Time: 2026-05-22T12:05:00.000Z (5 minutes elapsed)
    const serverNowIso = "2026-05-22T12:05:00.000Z";
    
    // Simulated Client Time: 2026-05-22T12:00:00.000Z (5 minutes behind server)
    const clientNow = new Date("2026-05-22T12:00:00.000Z");
    vi.setSystemTime(clientNow);

    const timerState: TimerState = {
      status: "running",
      currentLevelIndex: 0,
      levelStartedAt: "2026-05-22T12:00:00.000Z", // level started at 12:00 Server Time
      pausedRemainingSeconds: null,
      registrationClosesAt: null,
      finishedAt: null,
    };

    const blindLevels: BlindLevel[] = [
      {
        id: "1",
        levelOrder: 1,
        smallBlind: 25,
        bigBlind: 50,
        ante: 0,
        reentryCloses: false,
        durationSeconds: 1200, // 20 minutes total (1200 seconds)
        isBreak: false,
        breakDurationSeconds: null,
      },
    ];

    // Render the component
    render(
      <AdminTimerClock
        timerState={timerState}
        blindLevels={blindLevels}
        serverNowIso={serverNowIso}
      />
    );

    // If drift correction works:
    // Server says current time is 12:05:00, level started at 12:00:00.
    // Elapsed = 5 minutes (300 seconds).
    // Remaining = 1200 - 300 = 900 seconds -> "15:00".
    // Without drift correction, client would think current time is 12:00:00, remaining = 1200 seconds -> "20:00".
    expect(screen.getByText("15:00")).toBeDefined();

    // Advance client timers by 10 seconds
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Countdown should advance to 14:50
    expect(screen.getByText("14:50")).toBeDefined();
  });
});
