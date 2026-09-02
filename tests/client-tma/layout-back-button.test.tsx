/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("client mini-app layout: кнопка «Назад»", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.pathname = "/client";
    (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: telegramWebApp() };
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it("keeps the header clear on the home screen — the tabs are enough there", () => {
    render(<ClientLayout>screen</ClientLayout>);

    expect(screen.queryByRole("button", { name: /назад/i })).toBeNull();
  });

  it("shows it on a screen with no tab of its own, and goes back on tap", () => {
    const { rerender } = render(<ClientLayout>screen</ClientLayout>);

    // The player walks from the home screen into the rating, as they would in the app.
    nav.pathname = "/client/rating";
    rerender(<ClientLayout>screen</ClientLayout>);

    fireEvent.click(screen.getByRole("button", { name: /назад/i }));
    expect(router.back).toHaveBeenCalled();
  });

  // history.length lies in a WebView: it counts entries from before the mini-app opened,
  // so trusting it walked the player out of the app entirely.
  it("takes a deep link with no history back to the home screen", () => {
    nav.pathname = "/client/achievements";

    render(<ClientLayout>screen</ClientLayout>);

    fireEvent.click(screen.getByRole("button", { name: /назад/i }));
    expect(router.push).toHaveBeenCalledWith("/client");
  });

  it("leaves Telegram's own back button hidden — one control is enough", () => {
    nav.pathname = "/client/rating";
    const tg = (window as unknown as { Telegram: { WebApp: ReturnType<typeof telegramWebApp> } })
      .Telegram.WebApp;

    render(<ClientLayout>screen</ClientLayout>);

    expect(tg.BackButton.show).not.toHaveBeenCalled();
  });
});
