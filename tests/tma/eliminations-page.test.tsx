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
});
