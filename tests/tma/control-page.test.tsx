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

  it("reloads the timer controls when the desk's state changes", async () => {
    vi.useFakeTimers();
    let timerState = pausedTimerState;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/tma/pulse" ? Response.json({ version: "v2" }) : Response.json({ timerState }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAControlPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: /воспроизведение/i })).toBeTruthy();

    timerState = { ...pausedTimerState, status: "running" };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByRole("button", { name: /пауза/i })).toBeTruthy();
    const asked = fetchMock.mock.calls.map(([input]) => String(input));
    expect(asked.filter((url) => url === "/api/tma/pulse")).toHaveLength(1);
    expect(asked).toHaveLength(3);
  });

  describe("breaking a table up", () => {
    const ACTIVE_TABLES = [
      { number: 1, players: 6 },
      { number: 2, players: 5 },
      { number: 3, players: 4 },
    ];

    function mockControl(
      extra: Record<string, unknown> = {},
      mergeResponse: () => Response = () => Response.json({ ok: true }),
    ) {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        void init;
        const url = String(input);
        if (url.startsWith("/api/tma/timer?scope=control")) {
          return Response.json({
            activeTables: ACTIVE_TABLES,
            tableMerge: null,
            timerState: { ...pausedTimerState, status: "running" },
            ...extra,
          });
        }
        if (url === "/api/tma/timer/table-merge") return mergeResponse();

        return Response.json({ ok: true });
      });
      vi.stubGlobal("fetch", fetchMock);

      return fetchMock;
    }

    function mergeCalls(fetchMock: ReturnType<typeof mockControl>) {
      return fetchMock.mock.calls.filter(([input]) => String(input) === "/api/tma/timer/table-merge");
    }

    afterEach(() => {
      delete (window as { Telegram?: unknown }).Telegram;
    });

    it("asks which table to break, listing the tables in play", async () => {
      mockControl();
      render(<TMAControlPage />);

      fireEvent.click(await screen.findByRole("button", { name: /объединение столов/i }));

      expect(screen.getByText("Какой стол расформировать?")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Стол 1 · 6 игроков" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Стол 2 · 5 игроков" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Стол 3 · 4 игрока" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Только пауза — рассажу сам" })).toBeTruthy();
    });

    it("breaks the table picked once the desk confirms where everybody goes", async () => {
      const fetchMock = mockControl();
      const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);
      render(<TMAControlPage />);

      fireEvent.click(await screen.findByRole("button", { name: /объединение столов/i }));
      fireEvent.click(screen.getByRole("button", { name: "Стол 3 · 4 игрока" }));

      expect(confirmMock).toHaveBeenCalledWith(
        "Расформировать стол 3? 4 игрока пересядут за столы 1 и 2.",
      );
      await waitFor(() => expect(mergeCalls(fetchMock)).toHaveLength(1));
      expect(mergeCalls(fetchMock)[0]?.[1]).toMatchObject({
        body: JSON.stringify({ table: 3 }),
        method: "POST",
      });
    });

    it("breaks nothing when the desk says no", async () => {
      const fetchMock = mockControl();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<TMAControlPage />);

      fireEvent.click(await screen.findByRole("button", { name: /объединение столов/i }));
      fireEvent.click(screen.getByRole("button", { name: "Стол 3 · 4 игрока" }));

      await waitFor(() => expect(screen.getByText("Какой стол расформировать?")).toBeTruthy());
      expect(mergeCalls(fetchMock)).toHaveLength(0);
    });

    it("still offers the plain pause, sending no table", async () => {
      const fetchMock = mockControl();
      render(<TMAControlPage />);

      fireEvent.click(await screen.findByRole("button", { name: /объединение столов/i }));
      fireEvent.click(screen.getByRole("button", { name: "Только пауза — рассажу сам" }));

      await waitFor(() => expect(mergeCalls(fetchMock)).toHaveLength(1));
      expect(mergeCalls(fetchMock)[0]?.[1]?.body).toBeUndefined();
    });

    it("shows why the server refused and keeps the choice open", async () => {
      const showAlert = vi.fn();
      (window as { Telegram?: unknown }).Telegram = {
        WebApp: {
          HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
          showAlert,
          showConfirm: (_message: string, callback: (ok: boolean) => void) => callback(true),
        },
      };
      mockControl({}, () =>
        Response.json({ error: "Не хватает мест: за столом 1 свободных мест нет" }, { status: 409 }),
      );
      render(<TMAControlPage />);

      fireEvent.click(await screen.findByRole("button", { name: /объединение столов/i }));
      fireEvent.click(screen.getByRole("button", { name: "Стол 3 · 4 игрока" }));

      await waitFor(() =>
        expect(showAlert).toHaveBeenCalledWith("Не хватает мест: за столом 1 свободных мест нет"),
      );
      expect(screen.getByText("Какой стол расформировать?")).toBeTruthy();
    });

    it("offers only the pause while a single table is playing", async () => {
      mockControl({ activeTables: [{ number: 1, players: 8 }] });
      render(<TMAControlPage />);

      fireEvent.click(await screen.findByRole("button", { name: /объединение столов/i }));

      expect(screen.getByText("Расформировывать нечего — играет один стол.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^Стол 1/ })).toBeNull();
    });

    it("lists who goes where while the room is being reseated", async () => {
      mockControl({
        tableMerge: {
          brokenTable: 3,
          moves: [
            { name: "Chura", playerId: "p1", seat: 3, seatLabel: "3", table: 1 },
            { name: "Олюшка", playerId: "p2", seat: 5, seatLabel: "5", table: 2 },
          ],
          startedAt: "2026-09-27T20:00:00.000Z",
        },
        timerState: pausedTimerState,
      });
      render(<TMAControlPage />);

      expect(await screen.findByText("Стол 3 расформирован")).toBeTruthy();
      const row = (name: string) => screen.getByText(name).closest("li")?.textContent;
      expect(row("Chura")).toBe("Churaстол 1, место 3");
      expect(row("Олюшка")).toBe("Олюшкастол 2, место 5");
      expect(screen.getByRole("button", { name: /закончить рассадку/i })).toBeTruthy();
    });
  });
});
