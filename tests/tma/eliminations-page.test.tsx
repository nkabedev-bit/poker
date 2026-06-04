/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TMAEliminationsPage from "@/app/tma/eliminations/page";
import type { TelegramWebApp } from "@/app/tma/layout";

function createTelegramWebApp(): TelegramWebApp {
  return {
    initData: "mock-init",
    ready: vi.fn(),
    expand: vi.fn(),
    showAlert: vi.fn(),
    showConfirm: vi.fn(),
    HapticFeedback: {
      impactOccurred: vi.fn(),
      notificationOccurred: vi.fn(),
    },
    MainButton: {
      setText: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      onClick: vi.fn(),
      offClick: vi.fn(),
      showProgress: vi.fn(),
      hideProgress: vi.fn(),
    },
  };
}

describe("TMAEliminationsPage", () => {
  beforeEach(() => {
    window.Telegram = { WebApp: createTelegramWebApp() };
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete window.Telegram;
  });

  it("records no re-entry without asking when re-entry is closed", async () => {
    let mainButtonClick: (() => void) | null = null;
    vi.mocked(window.Telegram!.WebApp!.MainButton.onClick).mockImplementation((callback) => {
      mainButtonClick = callback;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players") {
        return Response.json({
          isBounty: false,
          reentryAvailable: false,
          players: [{ id: "player-1", name: "Player 1", status: "active" }],
        });
      }

      if (String(input) === "/api/tma/eliminations" && init?.method === "POST") {
        return Response.json({ elimination: { id: "elim-1" } });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAEliminationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /player 1/i }));
    await screen.findByText(/всё верно/i);

    await waitFor(() => expect(mainButtonClick).toBeTypeOf("function"));
    act(() => {
      mainButtonClick?.();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/eliminations",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"uses_reentry":false'),
        }),
      );
    });
    expect(screen.queryByText(/использует ли игрок ре-энтри/i)).toBeNull();
  });

  it("records no re-entry without asking when the player reached the re-entry limit", async () => {
    let mainButtonClick: (() => void) | null = null;
    vi.mocked(window.Telegram!.WebApp!.MainButton.onClick).mockImplementation((callback) => {
      mainButtonClick = callback;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players") {
        return Response.json({
          isBounty: false,
          maxReentries: 2,
          reentryAvailable: true,
          reentryEnabled: true,
          players: [{ id: "player-1", name: "Player 1", rebuys: 2, status: "active" }],
        });
      }

      if (String(input) === "/api/tma/eliminations" && init?.method === "POST") {
        return Response.json({ elimination: { id: "elim-1" } });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAEliminationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /player 1/i }));
    await screen.findByText(/всё верно/i);

    await waitFor(() => expect(mainButtonClick).toBeTypeOf("function"));
    act(() => {
      mainButtonClick?.();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/eliminations",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"uses_reentry":false'),
        }),
      );
    });
    expect(screen.queryByText(/использует ли игрок ре-энтри/i)).toBeNull();
  });

  it("checks fresh re-entry state before confirming an elimination", async () => {
    let mainButtonClick: (() => void) | null = null;
    vi.mocked(window.Telegram!.WebApp!.MainButton.onClick).mockImplementation((callback) => {
      mainButtonClick = callback;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players") {
        const firstLoad = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/tma/players").length === 1;

        return Response.json({
          isBounty: false,
          maxReentries: 1,
          reentryAvailable: !firstLoad,
          reentryEnabled: !firstLoad,
          players: [{ id: "player-1", name: "Player 1", rebuys: 0, status: "active" }],
        });
      }

      if (String(input) === "/api/tma/eliminations" && init?.method === "POST") {
        return Response.json({ elimination: { id: "elim-1" } });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAEliminationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /player 1/i }));
    await screen.findByText(/всё верно/i);

    await waitFor(() => expect(mainButtonClick).toBeTypeOf("function"));
    await act(async () => {
      mainButtonClick?.();
    });

    await screen.findByText(/использует ли игрок ре-энтри/i);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/tma/eliminations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("submits only once when confirmation is tapped twice", async () => {
    const postResolvers: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players") {
        return Promise.resolve(
          Response.json({
            isBounty: false,
            reentryAvailable: false,
            players: [{ id: "player-1", name: "Player 1", status: "active" }],
          }),
        );
      }

      if (String(input) === "/api/tma/eliminations" && init?.method === "POST") {
        return new Promise<Response>((resolve) => postResolvers.push(resolve));
      }

      return Promise.resolve(Response.json({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAEliminationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /player 1/i }));
    await screen.findByText(/всё верно/i);

    const confirmButton = screen.getByRole("button", { name: /подтвердить выбывание/i });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        ([input, init]) => String(input) === "/api/tma/eliminations" && init?.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(String(posts[0][1]?.body)).toContain('"client_request_id":');
    });

    postResolvers[0]?.(Response.json({ elimination: { id: "elim-1" } }));
  });

  it("opens the confirmation step when Telegram haptics are unavailable", async () => {
    window.Telegram = {
      WebApp: {
        ...createTelegramWebApp(),
        HapticFeedback: undefined,
      } as unknown as TelegramWebApp,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/tma/players") {
          return Response.json({
            isBounty: false,
            players: [{ id: "player-1", name: "Player 1", status: "active" }],
          });
        }

        return Response.json({ ok: true });
      }),
    );

    render(<TMAEliminationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /player 1/i }));

    await screen.findByText(/всё верно/i);
  });

  it("filters eliminations and bounty killers by selected table", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/tma/players") {
        return Response.json({
          isBounty: true,
          tablesCount: 2,
          players: [
            { id: "player-1", name: "Table 1 Out", table: 1, status: "active" },
            { id: "player-2", name: "Table 1 Killer", table: 1, status: "active" },
            { id: "player-3", name: "Table 2 Killer", table: 2, status: "active" },
          ],
        });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAEliminationsPage />);

    await screen.findByRole("button", { name: /table 1 out/i });
    expect(screen.getByRole("button", { name: /table 2 killer/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Фильтр по столу"), { target: { value: "1" } });

    expect(screen.getByRole("button", { name: /table 1 out/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /table 2 killer/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /table 1 out/i }));
    await screen.findByText(/кто выбил/i);

    expect(screen.getByRole("button", { name: /table 1 killer/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /table 2 killer/i })).toBeNull();
  });

  it("returns to the eliminations list when the wrong player was selected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/tma/players") {
          return Response.json({
            isBounty: true,
            players: [
              { id: "player-1", name: "Wrong Player", status: "active" },
              { id: "player-2", name: "Right Player", status: "active" },
            ],
          });
        }

        return Response.json({ ok: true });
      }),
    );

    render(<TMAEliminationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /wrong player/i }));
    await screen.findByText(/кто выбил/i);

    fireEvent.click(screen.getByRole("button", { name: /назад к списку/i }));

    await screen.findByRole("button", { name: /right player/i });
    expect(screen.queryByText(/кто выбил/i)).toBeNull();
  });

  it("refreshes the eliminations list every 5 seconds on the list step", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          players: [{ id: "player-1", name: "Eliminated Elsewhere", status: "active" }],
        }),
      )
      .mockResolvedValue(Response.json({ players: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAEliminationsPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: /eliminated elsewhere/i })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.queryByRole("button", { name: /eliminated elsewhere/i })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
