/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: "/client" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => router,
}));
vi.mock("next/script", () => ({ default: () => null }));

const { default: ClientLayout } = await import("@/app/client/layout");
const { LoadingScreen } = await import("@/app/client/_components/ui");

const selectionChanged = vi.fn();

function pill(container: HTMLElement) {
  return container.querySelector("nav > span[aria-hidden]") as HTMLElement;
}

describe("client mini-app layout: нижнее меню", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.pathname = "/client";
    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: "mock-init",
        initDataUnsafe: { user: { id: 1 } },
        ready: vi.fn(),
        expand: vi.fn(),
        showAlert: vi.fn(),
        HapticFeedback: {
          impactOccurred: vi.fn(),
          notificationOccurred: vi.fn(),
          selectionChanged,
        },
      },
    };
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it("keeps one pill under the tab the player is on", async () => {
    nav.pathname = "/client/profile";
    const { container } = render(<ClientLayout>screen</ClientLayout>);
    await screen.findAllByRole("link");

    // The fourth tab: three tabs and their gaps to the left of it.
    expect(pill(container).style.transform).toBe("translateX(234px)");
    expect(pill(container).className).not.toContain("opacity-0");
  });

  it("hides the pill where it was on a screen that has no tab of its own", async () => {
    nav.pathname = "/client/tournaments";
    const { container, rerender } = render(<ClientLayout>screen</ClientLayout>);
    await screen.findAllByRole("link");

    nav.pathname = "/client/rating";
    rerender(<ClientLayout>screen</ClientLayout>);

    expect(pill(container).className).toContain("opacity-0");
    // Still under «Турниры», so it comes back from there rather than from the first tab.
    expect(pill(container).style.transform).toBe("translateX(78px)");
  });

  it("ticks the phone on a move to another tab, and not on the tab already open", async () => {
    // The tap is the point here, not the page jsdom cannot open.
    const stayOnPage = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("click", stayOnPage, true);

    render(<ClientLayout>screen</ClientLayout>);
    const [home, tournaments] = await screen.findAllByRole("link");

    fireEvent.click(home);
    expect(selectionChanged).not.toHaveBeenCalled();

    fireEvent.click(tournaments);
    expect(selectionChanged).toHaveBeenCalledTimes(1);

    document.removeEventListener("click", stayOnPage, true);
  });
});

describe("client mini-app: заглушка загрузки", () => {
  afterEach(cleanup);

  it("says the screen is loading and draws the shape of what is coming", () => {
    const { container } = render(<LoadingScreen shape="rating" />);

    const status = screen.getByRole("status", { name: "Загрузка" });
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll(".client-skeleton").length).toBeGreaterThan(3);
  });

  it("stands in for a list of cards by default", () => {
    const { container } = render(<LoadingScreen />);

    expect(container.querySelectorAll(".client-skeleton")).toHaveLength(3);
  });
});
