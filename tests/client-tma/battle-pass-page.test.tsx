/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: "/client" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => router,
}));
vi.mock("next/script", () => ({ default: () => null }));

const { default: ClientLayout } = await import("@/app/client/layout");
const { default: ClientBattlePassPage } = await import("@/app/client/battle-pass/page");

describe("client mini-app: Боевой пропуск", () => {
  beforeEach(() => {
    nav.pathname = "/client";
    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: "mock-init",
        initDataUnsafe: { user: { id: 1 } },
        ready: vi.fn(),
        expand: vi.fn(),
        showAlert: vi.fn(),
      },
    };
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it("sits third in the tab bar, between the tournaments and the profile", async () => {
    render(<ClientLayout>screen</ClientLayout>);

    const tabs = within(await screen.findByRole("navigation", { name: "Нижнее меню" })).getAllByRole("link");

    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Главная",
      "Турниры",
      "Боевой пропуск",
      "Профиль",
    ]);
    expect(tabs[2].getAttribute("href")).toBe("/client/battle-pass");
  });

  // The prizes are still being decided, so the screen is an announcement and nothing more.
  it("shows the title with «Скоро» under it", () => {
    render(<ClientBattlePassPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Боевой пропуск" })).toBeTruthy();
    expect(screen.getByText("Скоро")).toBeTruthy();
  });
});
