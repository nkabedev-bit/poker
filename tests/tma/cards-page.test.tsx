/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TMACardsPage from "@/app/tma/cards/page";
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

/** The desk with cards on and nobody seated yet. */
function stubDesk() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/tma/cards?")) return Response.json({ session: null });
    if (url.startsWith("/api/tma/cards")) return Response.json({ cardsEnabled: true, issued: [] });
    if (url.startsWith("/api/tma/event-signups")) return Response.json({ signups: [] });

    return Response.json({ players: [], tablesCount: 1 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openManualEntry() {
  render(<TMACardsPage />);
  fireEvent.click(await screen.findByText("Ввести код вручную"));
}

describe("typing a card code at the desk", () => {
  beforeEach(() => {
    window.Telegram = { WebApp: createTelegramWebApp() };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete window.Telegram;
  });

  it("reads the club's own cards without picking anything", async () => {
    const fetchMock = stubDesk();
    await openManualEntry();

    fireEvent.change(screen.getByPlaceholderText("001"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Найти"));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/tma/cards?code=MJ-005")).toBe(
        true,
      ),
    );
  });

  // A guest card carries the same digits as one of the club's own, so the pack has to be
  // said out loud — otherwise G-005 looks up MJ-005 and finds the wrong player.
  it("reads a guest card once the desk picks the guest pack", async () => {
    const fetchMock = stubDesk();
    await openManualEntry();

    fireEvent.click(screen.getByLabelText("Карты G"));
    fireEvent.change(screen.getByPlaceholderText("001"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Найти"));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/tma/cards?code=G-005")).toBe(
        true,
      ),
    );
  });
});
