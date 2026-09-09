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
    // A real client calls back once the admin closes the alert; a mock that stays silent
    // would test a screen nobody ever sees.
    showAlert: vi.fn((_message: string, callback?: () => void) => callback?.()),
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

// A night played without cards: the desk finds the walk-in by nickname and sends them to
// a chair, and used to be left with no idea which chair that was.
describe("seating a walk-in from the roster", () => {
  const WALK_IN = {
    id: "player-1",
    name: "Валет",
    cardCode: null,
    registrationNumber: 7,
    seat: null,
    status: "active" as const,
    table: null,
  };

  function stubRoster() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/tma/cards?")) return Response.json({ session: null });
      if (url.startsWith("/api/tma/cards")) return Response.json({ cardsEnabled: false, issued: [] });
      if (url.startsWith("/api/tma/event-signups")) return Response.json({ signups: [] });

      return Response.json({ players: [WALK_IN], seatsPerTable: 10, tablesCount: 3 });
    });

    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    window.Telegram = { WebApp: createTelegramWebApp() };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete window.Telegram;
  });

  it("names the table and the seat once the player is sat down", async () => {
    stubRoster();
    render(<TMACardsPage />);

    fireEvent.click(await screen.findByText("Валет"));
    fireEvent.click(await screen.findByLabelText("Стол 2, место 4, свободно"));
    fireEvent.click(screen.getByRole("button", { name: /посадить за стол 2, место 4/i }));

    await waitFor(() => {
      expect(window.Telegram?.WebApp?.showAlert).toHaveBeenCalledWith(
        "Валет посажен за стол 2, место 4",
        expect.any(Function),
      );
    });
  });

  it("keeps the seating screen up until the admin acknowledges it", async () => {
    stubRoster();
    let acknowledge: (() => void) | undefined;
    window.Telegram!.WebApp!.showAlert = vi.fn((_message: string, callback?: () => void) => {
      acknowledge = callback;
    });

    render(<TMACardsPage />);

    fireEvent.click(await screen.findByText("Валет"));
    fireEvent.click(await screen.findByLabelText("Стол 2, место 4, свободно"));
    fireEvent.click(screen.getByRole("button", { name: /посадить за стол 2, место 4/i }));

    await waitFor(() => expect(acknowledge).toBeTypeOf("function"));
    expect(screen.getByText("Куда сажаем")).toBeTruthy();

    acknowledge!();
    await waitFor(() => expect(screen.queryByText("Куда сажаем")).toBeNull());
  });
});
