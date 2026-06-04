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

  it("raises bottom tabs above iPhone safe area and keeps content clear", async () => {
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    const content = await screen.findByText("TMA content");
    const main = content.closest("main");
    const nav = screen.getByRole("navigation");

    expect(main?.className).toContain("pb-[calc(6rem+env(safe-area-inset-bottom)+8px)]");
    expect(nav.className).toContain("bottom-[calc(env(safe-area-inset-bottom)+8px)]");
  });
});
