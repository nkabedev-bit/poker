/**
 * @vitest-environment jsdom
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: "/client" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => router,
}));
vi.mock("next/script", () => ({ default: () => null }));

const { default: ClientLayout } = await import("@/app/client/layout");

function telegramWebApp() {
  return {
    initData: "mock-init",
    initDataUnsafe: { user: { id: 1 } },
    ready: vi.fn(),
    expand: vi.fn(),
    showAlert: vi.fn(),
    BackButton: {
      hide: vi.fn(),
      offClick: vi.fn(),
      onClick: vi.fn(),
      show: vi.fn(),
    },
  };
}

describe("client mini-app layout: кнопка «Назад» Telegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.pathname = "/client";
    (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: telegramWebApp() };
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it("keeps the button hidden on the home screen — the tabs are enough there", async () => {
    const tg = (window as unknown as { Telegram: { WebApp: ReturnType<typeof telegramWebApp> } })
      .Telegram.WebApp;

    render(<ClientLayout>screen</ClientLayout>);

    await waitFor(() => expect(tg.BackButton.hide).toHaveBeenCalled());
    expect(tg.BackButton.show).not.toHaveBeenCalled();
  });

  it("shows it on a screen with no tab of its own, and goes back on tap", async () => {
    const tg = (window as unknown as { Telegram: { WebApp: ReturnType<typeof telegramWebApp> } })
      .Telegram.WebApp;

    const { rerender } = render(<ClientLayout>screen</ClientLayout>);

    // The player walks from the home screen into the rating, as they would in the app.
    nav.pathname = "/client/rating";
    rerender(<ClientLayout>screen</ClientLayout>);

    await waitFor(() => expect(tg.BackButton.show).toHaveBeenCalled());

    const handler = tg.BackButton.onClick.mock.calls[0]?.[0] as () => void;
    handler();
    expect(router.back).toHaveBeenCalled();
  });

  // Navigating between two inner screens must not blink the button off and on.
  it("keeps the button up while moving between screens without tabs", async () => {
    nav.pathname = "/client/rating";
    const tg = (window as unknown as { Telegram: { WebApp: ReturnType<typeof telegramWebApp> } })
      .Telegram.WebApp;

    const { rerender } = render(<ClientLayout>screen</ClientLayout>);
    await waitFor(() => expect(tg.BackButton.show).toHaveBeenCalled());

    nav.pathname = "/client/games/2026-09-01T19:00:00.000Z";
    rerender(<ClientLayout>screen</ClientLayout>);

    expect(tg.BackButton.hide).not.toHaveBeenCalled();
  });

  it("takes a deep link with no history back to the home screen", async () => {
    nav.pathname = "/client/achievements";
    const tg = (window as unknown as { Telegram: { WebApp: ReturnType<typeof telegramWebApp> } })
      .Telegram.WebApp;

    render(<ClientLayout>screen</ClientLayout>);

    await waitFor(() => expect(tg.BackButton.onClick).toHaveBeenCalled());

    const handler = tg.BackButton.onClick.mock.calls[0]?.[0] as () => void;
    handler();
    expect(router.push).toHaveBeenCalledWith("/client");
  });
});
