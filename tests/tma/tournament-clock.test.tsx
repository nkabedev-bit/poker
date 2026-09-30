/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TMA_DESK_CHANGED_EVENT,
  TournamentClockProvider,
  TournamentStatusBar,
} from "@/app/tma/tournament-clock";

const LEVELS = [
  { ante: 0, big_blind: 200, break_duration_seconds: null, duration_seconds: 1200, id: "l1", is_break: false, level_order: 1, small_blind: 100 },
  { ante: 400, big_blind: 400, break_duration_seconds: null, duration_seconds: 1200, id: "l2", is_break: false, level_order: 2, small_blind: 200 },
  { ante: 0, big_blind: null, break_duration_seconds: 600, duration_seconds: 600, id: "b1", is_break: true, level_order: 3, small_blind: null },
];

function timerRow(status: string, extra: Record<string, unknown> = {}) {
  return {
    current_level_index: 1,
    finished_at: null,
    level_started_at: "2026-10-01T18:00:00.000Z",
    paused_remaining_seconds: 754,
    registration_closes_at: null,
    status,
    ...extra,
  };
}

function renderBar(onToggle = vi.fn()) {
  render(
    <TournamentClockProvider initData="mock" pathname="/tma/players">
      <TournamentStatusBar onToggle={onToggle} />
    </TournamentClockProvider>,
  );
  return onToggle;
}

describe("TournamentStatusBar", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the level, the blinds and the time left of a paused clock", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ blindLevels: LEVELS, timerState: timerRow("paused") })));

    const onToggle = renderBar();

    expect(await screen.findByText(/Ур\. 2 · 200 \/ 400/)).toBeTruthy();
    expect(screen.getByText("12:34")).toBeTruthy();
    expect(screen.getByText("Пауза · след. перерыв")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(onToggle).toHaveBeenCalledWith("start");
  });

  it("counts a running level down on the phone, without asking the server again", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-01T18:10:00.000Z"), shouldAdvanceTime: false });
    const fetchMock = vi.fn(async () => Response.json({ blindLevels: LEVELS, timerState: timerRow("running") }));
    vi.stubGlobal("fetch", fetchMock);

    const onToggle = renderBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Ten minutes into a twenty-minute level.
    expect(screen.getByText("10:00")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText("09:57")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Пауза" }));
    expect(onToggle).toHaveBeenCalledWith("pause");
  });

  it("reads the timer again when the desk's pulse sees a change", async () => {
    const fetchMock = vi.fn(async () => Response.json({ blindLevels: LEVELS, timerState: timerRow("paused") }));
    vi.stubGlobal("fetch", fetchMock);

    renderBar();
    await screen.findByText("12:34");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event(TMA_DESK_CHANGED_EVENT));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("offers no pause before the tournament starts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ blindLevels: LEVELS, timerState: timerRow("not_started", { current_level_index: 0 }) }),
      ),
    );

    renderBar();

    expect(await screen.findByText("Турнир не начат")).toBeTruthy();
    expect(screen.getByText("Уровень 1 · 100 / 200")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
