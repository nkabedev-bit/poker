/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TMALayout, { type TelegramWebApp } from "@/app/tma/layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tma/bot",
}));

function createTelegramWebApp(): TelegramWebApp {
  return {
    initData: "mock",
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

describe("TMALayout", () => {
  beforeEach(() => {
    window.Telegram = { WebApp: createTelegramWebApp() };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.Telegram;
  });

  // The bar sits in the column instead of over the page: pinned to the viewport it
  // covered whatever a screen put at its own bottom, and the keyboard made it drift.
  it("keeps the bottom tabs out of the content", async () => {
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    const content = await screen.findByText("TMA content");
    const main = content.closest("main");
    const nav = screen.getByRole("navigation");

    expect(main?.className).toContain("overflow-y-auto");
    expect(nav.className).not.toContain("fixed");
    expect(nav.className).toContain("shrink-0");
  });

  it("clears the iPhone home indicator under the tabs", async () => {
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    await screen.findByText("TMA content");

    expect(screen.getByRole("navigation").className).toContain(
      "pb-[env(safe-area-inset-bottom)]",
    );
  });
});
