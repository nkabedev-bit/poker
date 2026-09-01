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

  it("adds the fixed 6000-chip addon after a single confirmation without asking for the amount", async () => {
    const showConfirm = vi.mocked(window.Telegram!.WebApp!.showConfirm);
    showConfirm.mockImplementation((_message, callback) => callback(true));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players" && !init?.method) {
        return Response.json({
          addonEnabled: true,
          maxAddons: 1,
          tablesCount: 3,
          players: [
            { id: "player-1", name: "Addon Player", table: 1, seat: 1, stack: 1000, status: "active", addons: 0 },
          ],
        });
      }

      if (String(input) === "/api/tma/players/player-1" && init?.method === "PATCH") {
        return Response.json({ player: { id: "player-1" } });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: /addon player/i }));
    fireEvent.click(await screen.findByRole("button", { name: /добавить аддон/i }));

    expect(screen.queryByLabelText(/кол-во фишек/i)).toBeNull();
    expect(showConfirm).toHaveBeenCalledWith(
      "Добавить игроку «Addon Player» 6 000 фишек?",
      expect.any(Function),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/players/player-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ action: "add_addon", chips: 6000 }),
        }),
      );
    });
  });

  it("does not send the addon when the confirmation is declined", async () => {
    const showConfirm = vi.mocked(window.Telegram!.WebApp!.showConfirm);
    showConfirm.mockImplementation((_message, callback) => callback(false));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players" && !init?.method) {
        return Response.json({
          addonEnabled: true,
          maxAddons: 1,
          tablesCount: 3,
          players: [
            { id: "player-1", name: "Addon Player", table: 1, seat: 1, stack: 1000, status: "active", addons: 0 },
          ],
        });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: /addon player/i }));
    fireEvent.click(await screen.findByRole("button", { name: /добавить аддон/i }));

    expect(showConfirm).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/tma/players/player-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("restores an eliminated player as a mistaken knockout", async () => {
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
    fireEvent.click(await screen.findByRole("button", { name: /вылет по ошибке/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/players/player-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ action: "restore_player", reentry: "none" }),
        }),
      );
    });
  });

  // A player who busts before the first break and waits for the x2 window must come
  // back marked as a re-entry — otherwise the bot and the sheet never show the rebuy.
  it("restores an eliminated player as a double re-entry when x2 is open", async () => {
    const players = [
      { id: "player-1", name: "Returned Player", table: 1, seat: 1, stack: 1000, status: "eliminated" },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players" && !init?.method) {
        return Response.json({
          tablesCount: 3,
          players,
          reentryEnabled: true,
          reentryAvailable: true,
          doubleReentryAvailable: true,
        });
      }

      if (String(input) === "/api/tma/players/player-1" && init?.method === "PATCH") {
        return Response.json({ player: { ...players[0], status: "active", rebuys: 1, doubleRebuys: 1 } });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: /returned player/i }));
    fireEvent.click(await screen.findByRole("button", { name: /вернуть в игру/i }));
    fireEvent.click(await screen.findByRole("button", { name: /двойной ребай/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/players/player-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ action: "restore_player", reentry: "double" }),
        }),
      );
    });
  });

  it("disables the re-entry options when the re-entry window is closed", async () => {
    const players = [
      { id: "player-1", name: "Returned Player", table: 1, seat: 1, stack: 1000, status: "eliminated" },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players" && !init?.method) {
        return Response.json({
          tablesCount: 3,
          players,
          reentryEnabled: true,
          reentryAvailable: false,
          doubleReentryAvailable: false,
        });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: /returned player/i }));
    fireEvent.click(await screen.findByRole("button", { name: /вернуть в игру/i }));

    const rebuyButton = (await screen.findByRole("button", { name: /^ребай/i })) as HTMLButtonElement;
    const doubleRebuyButton = screen.getByRole("button", { name: /двойной ребай/i }) as HTMLButtonElement;
    const mistakeButton = screen.getByRole("button", { name: /вылет по ошибке/i }) as HTMLButtonElement;

    expect(rebuyButton.disabled).toBe(true);
    expect(doubleRebuyButton.disabled).toBe(true);
    expect(mistakeButton.disabled).toBe(false);
  });

  it("adds an addon to several players picked from the list in one request", async () => {
    const showConfirm = vi.mocked(window.Telegram!.WebApp!.showConfirm);
    showConfirm.mockImplementation((_message, callback) => callback(true));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tma/players" && !init?.method) {
        return Response.json({
          addonEnabled: true,
          maxAddons: 1,
          tablesCount: 3,
          players: [
            { id: "player-1", name: "Первый", table: 1, seat: 1, stack: 1000, status: "active", addons: 0 },
            { id: "player-2", name: "Второй", table: 1, seat: 2, stack: 1000, status: "active", addons: 0 },
            { id: "player-3", name: "Третий", table: 2, seat: 1, stack: 1000, status: "active", addons: 0 },
          ],
        });
      }

      if (String(input) === "/api/tma/players/addons") {
        return Response.json({ applied: [{ id: "player-1", name: "Первый" }, { id: "player-2", name: "Второй" }], failed: [] });
      }

      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Аддон списком" }));
    fireEvent.click(await screen.findByLabelText("Выбрать Первый"));
    fireEvent.click(screen.getByLabelText("Выбрать Второй"));
    fireEvent.click(screen.getByRole("button", { name: /добавить аддон 2 игрокам/i }));

    const confirmText = String(showConfirm.mock.calls[0]?.[0] ?? "");
    expect(confirmText).toContain("2 игрокам?");
    expect(confirmText).toContain("Первый, Второй");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/players/addons",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ playerIds: ["player-1", "player-2"] }),
        }),
      );
    });
  });

  it("disables players who used their addon limit and hides eliminated ones from the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          addonEnabled: true,
          maxAddons: 1,
          tablesCount: 3,
          players: [
            { id: "player-1", name: "Свободный", table: 1, seat: 1, stack: 1000, status: "active", addons: 0 },
            { id: "player-2", name: "Лимитный", table: 1, seat: 2, stack: 1000, status: "active", addons: 1 },
            { id: "player-3", name: "Выбывший", table: 1, seat: 3, stack: 0, status: "eliminated", addons: 0 },
          ],
        }),
      ),
    );

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Аддон списком" }));

    expect((await screen.findByLabelText("Выбрать Свободный") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Выбрать Лимитный") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Выбрать Выбывший")).toBeNull();
  });

  it("names the players a bulk addon could not be applied to", async () => {
    const showConfirm = vi.mocked(window.Telegram!.WebApp!.showConfirm);
    showConfirm.mockImplementation((_message, callback) => callback(true));
    const showAlert = vi.mocked(window.Telegram!.WebApp!.showAlert);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/tma/players" && !init?.method) {
          return Response.json({
            addonEnabled: true,
            maxAddons: 1,
            tablesCount: 3,
            players: [
              { id: "player-1", name: "Первый", table: 1, seat: 1, stack: 1000, status: "active", addons: 0 },
              { id: "player-2", name: "Второй", table: 1, seat: 2, stack: 1000, status: "active", addons: 0 },
            ],
          });
        }

        if (String(input) === "/api/tma/players/addons") {
          return Response.json({
            applied: [{ id: "player-1", name: "Первый" }],
            failed: [{ id: "player-2", name: "Второй", reason: "limit" }],
          });
        }

        return Response.json({ ok: true });
      }),
    );

    render(<TMAPlayersPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Аддон списком" }));
    fireEvent.click(await screen.findByLabelText("Выбрать Первый"));
    fireEvent.click(screen.getByLabelText("Выбрать Второй"));
    fireEvent.click(screen.getByRole("button", { name: /добавить аддон 2 игрокам/i }));

    await waitFor(() => {
      expect(showAlert).toHaveBeenCalledWith(
        "Аддон добавлен: 1. Не прошли: 1 (Второй — лимит аддонов)",
      );
    });
  });
});
