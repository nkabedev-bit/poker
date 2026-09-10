/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: "/client" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => router,
}));
// Stands in for a script that never arrives — which is what a filtered telegram.org
// looked like from Russia: the request hung open instead of failing.
vi.mock("next/script", () => ({ default: () => null }));

const { default: ClientLayout } = await import("@/app/client/layout");

/** How long the layout waits for Telegram before calling this an ordinary browser. */
const TELEGRAM_WAIT_MS = 1200;

describe("client mini-app layout: Telegram's script never loads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    nav.pathname = "/client";
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    window.sessionStorage.clear();
    window.location.hash = "";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits at first — a Telegram player must not see the web sign-in flash by", () => {
    render(<ClientLayout>содержимое</ClientLayout>);

    expect(screen.getByText("Загрузка…")).toBeTruthy();
    expect(screen.queryByText("содержимое")).toBeNull();
  });

  // The bug this guards: the screen sat on "Загрузка…" for good, because the script was
  // waited on before anything else could run. Waiting is fine; waiting forever is not.
  it("opens the web door once the wait is up, rather than loading for good", () => {
    render(<ClientLayout>содержимое</ClientLayout>);

    act(() => {
      vi.advanceTimersByTime(TELEGRAM_WAIT_MS + 100);
    });

    expect(screen.getByText("содержимое")).toBeTruthy();
    expect(screen.queryByText("Загрузка…")).toBeNull();
  });

  it("still keeps a Telegram player waiting: the fragment says where they came from", () => {
    window.location.hash = "#tgWebAppData=signed";

    render(<ClientLayout>содержимое</ClientLayout>);

    act(() => {
      vi.advanceTimersByTime(TELEGRAM_WAIT_MS + 100);
    });

    expect(screen.getByText("Загрузка…")).toBeTruthy();
  });
});
