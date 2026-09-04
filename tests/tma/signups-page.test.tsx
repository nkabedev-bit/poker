/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TMASignupsPage from "@/app/tma/signups/page";
import type { TelegramWebApp } from "@/app/tma/layout";

function createTelegramWebApp(): TelegramWebApp {
  return {
    initData: "mock-init",
    ready: vi.fn(),
    expand: vi.fn(),
    showAlert: vi.fn(),
    showConfirm: vi.fn(),
    HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
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

const SIGNUP = {
  id: "signup-1",
  name: "Ace High",
  seated: false,
  telegramId: 555,
  ticketType: "vip" as const,
  usePass: "vip" as const,
  username: "ace",
};

const PROFILE = {
  agreementAccepted: true,
  birthDate: "14.06.1990",
  discoverySource: "Друзья",
  displayName: "Ace High",
  freeEntries: { regular: 0, vip: 1 },
  fullName: "Иван Иванов",
  notificationsConsent: true,
  phone: "+7 911 000-00-00",
  ratingConsent: true,
  submittedAt: "2026-08-01T10:00:00.000Z",
  username: "ace",
};

function mockFetch({ profile = PROFILE as unknown }: { profile?: unknown } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.startsWith("/api/tma/event-signups")) {
      return Response.json({ event: null, signups: [SIGNUP], tablesCount: 3 });
    }
    if (url.startsWith("/api/tma/players")) {
      return Response.json({ players: [], tablesCount: 3 });
    }
    if (url.startsWith("/api/tma/client-profile")) {
      return Response.json({ profile });
    }

    return Response.json({ ok: true });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("TMASignupsPage", () => {
  beforeEach(() => {
    window.Telegram = { WebApp: createTelegramWebApp() };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.Telegram;
  });

  it("opens the questionnaire the player filled in when they joined", async () => {
    const fetchMock = mockFetch();
    render(<TMASignupsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /ace high/i }));

    await screen.findByText("Иван Иванов");
    expect(screen.getByText("+7 911 000-00-00")).toBeTruthy();
    expect(screen.getByText("14.06.1990")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tma/client-profile?telegramId=555",
      expect.anything(),
    );
  });

  it("says so plainly when the player has no questionnaire", async () => {
    mockFetch({ profile: null });
    render(<TMASignupsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /ace high/i }));

    await screen.findByText(/анкета не найдена/i);
  });

  // Seating needs a chair, and the server refuses a request without one.
  it("sends the seat the admin picked", async () => {
    const fetchMock = mockFetch();
    render(<TMASignupsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /ace high/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Посадить за стол" }));
    fireEvent.click(await screen.findByLabelText("Стол 3, место 5, свободно"));
    fireEvent.click(screen.getByRole("button", { name: /посадить за стол 3, место 5/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tma/event-signups/signup-1/seat",
        expect.objectContaining({ body: expect.stringContaining('"seat":5') }),
      );
    });
  });
});
