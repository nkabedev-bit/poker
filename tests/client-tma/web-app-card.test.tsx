/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const telegram = { openLink: vi.fn() };
const showClientAlert = vi.fn();

vi.mock("@/app/client/layout", () => ({
  getClientTelegramWebApp: () => telegram,
  showClientAlert,
  useClientTMA: () => ({ initData: "signed-init", telegramUser: null }),
}));

const { WebAppCard } = await import("@/app/client/_components/web-app-card");

describe("WebAppCard — the mini-app's way out to the web app", () => {
  beforeEach(() => {
    telegram.openLink.mockReset();
    showClientAlert.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reads like a club announcement", () => {
    render(<WebAppCard />);

    expect(screen.getByText("Объявление клуба")).toBeTruthy();
    expect(screen.getByText("Добавьте Majestic на главный экран и доступ к приложению будет даже без VPN")).toBeTruthy();
  });

  it("asks for the player's pass and opens the site in the browser with it", async () => {
    const fetchMock = vi.fn(async () => Response.json({ token: "pass.sig" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<WebAppCard />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/client-tma/web-link", {
      headers: { "X-Telegram-Init-Data": "signed-init" },
      method: "POST",
    });
    expect(telegram.openLink).toHaveBeenCalledWith(`${window.location.origin}/client/login?link=pass.sig`);
  });

  it("says so when the pass does not come", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    render(<WebAppCard />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(telegram.openLink).not.toHaveBeenCalled();
    expect(showClientAlert).toHaveBeenCalled();
  });
});
