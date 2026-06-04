/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TMAPlayersPage from "@/app/tma/players/page";
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

describe("TMAPlayersPage", () => {
  beforeEach(() => {
    window.Telegram = { WebApp: createTelegramWebApp() };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete window.Telegram;
  });

  it("filters players by selected table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          tablesCount: 3,
          players: [
            { id: "player-1", name: "Table 1 Player", table: 1, seat: 1, stack: 1000, status: "active" },
            { id: "player-2", name: "Table 2 Player", table: 2, seat: 1, stack: 1000, status: "active" },
            { id: "player-3", name: "Eliminated Table 1", table: 1, seat: 2, stack: 0, status: "eliminated" },
          ],
        }),
      ),
    );

    render(<TMAPlayersPage />);

    await screen.findByText("Table 1 Player");
    expect(screen.getByText("Table 2 Player")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Фильтр по столу"), { target: { value: "1" } });

    expect(screen.getByText("Table 1 Player")).toBeTruthy();
    expect(screen.getByText("Eliminated Table 1")).toBeTruthy();
    expect(screen.queryByText("Table 2 Player")).toBeNull();

    fireEvent.change(screen.getByLabelText("Фильтр по столу"), { target: { value: "" } });

    await waitFor(() => expect(screen.getByText("Table 2 Player")).toBeTruthy());
  });

  it("moves a selected player to another table", async () => {
    let players = [
      { id: "player-1", name: "Table 1 Player", table: 1, seat: 1, stack: 1000, status: "active" },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players" && !init?.method) {
        return Response.json({ tablesCount: 3, players });
      }

      if (String(input) === "/api/tma/players/player-1" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        players = players.map((player) =>
          player.id === "player-1" ? { ...player, table: Number(body.table) } : player,
        );
        return Response.json({ player: players[0] });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: /table 1 player/i }));
    fireEvent.change(await screen.findByLabelText("Пересадить за стол"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /сохранить стол/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/players/player-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ action: "move_table", table: 3 }),
        }),
      );
    });
    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
  });

  it("refreshes the players list every 5 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          players: [
            { id: "player-1", name: "Deleted Elsewhere", table: 1, seat: 1, stack: 1000, status: "active" },
          ],
        }),
      )
      .mockResolvedValue(Response.json({ players: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAPlayersPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(screen.getByText("Deleted Elsewhere")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.queryByText("Deleted Elsewhere")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows the server capacity message when adding a player fails", async () => {
    let mainButtonClick: (() => void) | null = null;
    vi.mocked(window.Telegram!.WebApp!.MainButton.onClick).mockImplementation((callback) => {
      mainButtonClick = callback;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/tma/players" && !init?.method) {
          return Response.json({ tablesCount: 2, players: [] });
        }

        if (String(input) === "/api/tma/players" && init?.method === "POST") {
          return Response.json(
            { error: "Уже зарегистрировано 4 игроков. Мест больше нет" },
            { status: 409 },
          );
        }

        return Response.json({});
      }),
    );

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: /добавить игрока/i }));
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Late Player" } });

    await waitFor(() => expect(mainButtonClick).toEqual(expect.any(Function)));
    await act(async () => {
      await mainButtonClick?.();
    });

    expect(window.Telegram!.WebApp!.showAlert).toHaveBeenCalledWith(
      "Уже зарегистрировано 4 игроков. Мест больше нет",
    );
  });

  it("restores an eliminated player from the player details card", async () => {
    const showConfirm = vi.mocked(window.Telegram!.WebApp!.showConfirm);
    showConfirm.mockImplementation((_message, callback) => callback(true));
    let players = [
      { id: "player-1", name: "Returned Player", table: 1, seat: 1, stack: 1000, status: "eliminated" },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players" && !init?.method) {
        return Response.json({ tablesCount: 3, players });
      }

      if (String(input) === "/api/tma/players/player-1" && init?.method === "PATCH") {
        players = players.map((player) =>
          player.id === "player-1" ? { ...player, status: "active" } : player,
        );
        return Response.json({ player: players[0] });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: /returned player/i }));
    fireEvent.click(await screen.findByRole("button", { name: /вернуть в игру/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/players/player-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ action: "restore_player" }),
        }),
      );
    });
    expect(showConfirm).toHaveBeenCalledWith(
      "Вернуть игрока Returned Player в игру?",
      expect.any(Function),
    );
  });
});
