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

function stubScreen(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ addEventListener: vi.fn(), matches: wide, removeEventListener: vi.fn() }),
  );
}

function sideNav() {
  return screen.getByRole("navigation", { name: "Разделы" });
}

describe("client app layout: боковое меню на компьютере", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.pathname = "/client";
    stubScreen(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: "mock-init",
        initDataUnsafe: { user: { first_name: "Дима", id: 1 } },
        ready: vi.fn(),
        expand: vi.fn(),
        showAlert: vi.fn(),
      },
    };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it("gives the rating a section of its own and marks the one the player is in", async () => {
    nav.pathname = "/client/players/onega";
    render(<ClientLayout>screen</ClientLayout>);
    await screen.findByText("screen");

    const sections = within(sideNav()).getAllByRole("link");
    expect(sections.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Главная",
      "Турниры",
      "Рейтинг",
      "Боевой пропуск",
      "Профиль",
    ]);
    expect(within(sideNav()).getByRole("link", { name: "Рейтинг" }).getAttribute("aria-current")).toBe("page");
    expect(within(sideNav()).getByRole("link", { name: "Главная" }).getAttribute("aria-current")).toBeNull();
  });

  it("leads from a screen under a section back up to it", async () => {
    nav.pathname = "/client/events/e-1";
    render(<ClientLayout>screen</ClientLayout>);
    await screen.findByText("screen");

    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: "Турниры" }).getAttribute("href")).toBe("/client/tournaments");
  });

  it("draws no way up on a section's own screen", async () => {
    nav.pathname = "/client/tournaments";
    render(<ClientLayout>screen</ClientLayout>);
    await screen.findByText("screen");

    expect(within(screen.getByRole("main")).queryByRole("link")).toBeNull();
  });

  it("fills the player's card from their profile on a wide screen", async () => {
    stubScreen(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ avatarUrl: null, displayName: "Дмитрий", favoriteHand: "AsKh", tier: "core" }),
        ok: true,
        status: 200,
      }),
    );

    render(<ClientLayout>screen</ClientLayout>);

    const card = await screen.findByText("Дмитрий");
    expect(card.closest("a")?.getAttribute("href")).toBe("/client/profile");
    expect(screen.getByText("CORE")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/client-tma/me", { headers: { "X-Telegram-Init-Data": "mock-init" } });
  });

  it("asks nothing of the server on a phone in Telegram — the tab bar shows no card", async () => {
    render(<ClientLayout>screen</ClientLayout>);
    await screen.findByText("screen");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the sign-in a screen of its own", async () => {
    nav.pathname = "/client/login";
    render(<ClientLayout>screen</ClientLayout>);
    await screen.findByText("screen");

    expect(screen.queryByRole("navigation", { name: "Разделы" })).toBeNull();
  });
});
