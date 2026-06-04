/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TMAControlPage from "@/app/tma/control/page";
import type { TimerState } from "@/lib/timer/types";

const pausedTimerState: TimerState = {
  status: "paused",
  currentLevelIndex: 0,
  levelStartedAt: "2026-05-13T10:00:00.000Z",
  pausedRemainingSeconds: 600,
  registrationClosesAt: null,
  finishedAt: null,
};

describe("TMAControlPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockTimerFetch(timerState: TimerState) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/tma/timer?scope=control")) {
        return Response.json({ timerState });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  }

  it("shows play control while paused and resumes via start action", async () => {
    const fetchMock = mockTimerFetch(pausedTimerState);

    render(<TMAControlPage />);

    const resumeButton = await screen.findByRole("button", { name: /воспроизведение/i });
    fireEvent.click(resumeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/timer/start",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("asks for confirmation before moving to next blind", async () => {
    const fetchMock = mockTimerFetch(pausedTimerState);
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TMAControlPage />);

    const nextButton = await screen.findByRole("button", { name: /следующий блайнд/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith("Вы уверены?");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/timer/next",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("asks for confirmation before finishing tournament", async () => {
    const fetchMock = mockTimerFetch(pausedTimerState);
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TMAControlPage />);

    const finishButton = await screen.findByRole("button", { name: /завершить турнир/i });
    fireEvent.click(finishButton);

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith("Вы уверены?");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/timer/finish",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("does not show timer or blind values on the control tab", async () => {
    mockTimerFetch(pausedTimerState);

    render(<TMAControlPage />);

    await screen.findByRole("button", { name: /воспроизведение/i });

    expect(screen.queryByText("ТАЙМЕР")).toBeNull();
    expect(screen.queryByText("ТЕКУЩИЕ БЛАЙНДЫ")).toBeNull();
    expect(screen.queryByText(/МБ:/i)).toBeNull();
  });

  it("refreshes timer controls every 5 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ timerState: pausedTimerState }))
      .mockResolvedValue(
        Response.json({
          timerState: {
            ...pausedTimerState,
            status: "running",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAControlPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: /воспроизведение/i })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByRole("button", { name: /пауза/i })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
