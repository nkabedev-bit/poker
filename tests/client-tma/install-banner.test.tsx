/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const telegram = { initData: "", openLink: vi.fn() };

vi.mock("@/app/client/layout", () => ({
  getClientTelegramWebApp: () => telegram,
  useClientTMA: () => ({ initData: telegram.initData, telegramUser: null }),
}));

const { InstallBanner } = await import("@/app/client/_components/install-banner");
const { listenForInstallPrompt } = await import("@/app/client/_components/install-prompt");

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value });
}

function setStandalone(standalone: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: standalone }) as unknown as typeof window.matchMedia;
}

describe("InstallBanner", () => {
  beforeEach(() => {
    telegram.initData = "";
    telegram.openLink.mockReset();
    window.localStorage.clear();
    setStandalone(false);
    setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)");
  });

  afterEach(() => {
    cleanup();
  });

  it("sends a mini-app player to the browser to install", () => {
    telegram.initData = "signed";

    render(<InstallBanner />);
    fireEvent.click(screen.getByRole("button", { name: /открыть в браузере/i }));

    expect(telegram.openLink).toHaveBeenCalledWith(`${window.location.origin}/client`);
  });

  it("tells an iPhone where «На экран „Домой“» is", () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");

    render(<InstallBanner />);

    expect(screen.getByText(/На экран „Домой“/)).toBeTruthy();
  });

  it("opens the browser's own dialog when it offers one", async () => {
    listenForInstallPrompt();
    const prompt = vi.fn(async () => undefined);
    const offer = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });

    render(<InstallBanner />);
    act(() => {
      window.dispatchEvent(offer);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /установить/i }));
    });

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("stays away inside the installed app", () => {
    setStandalone(true);

    const { container } = render(<InstallBanner />);

    expect(container.textContent).toBe("");
  });

  it("goes away when closed, and stays away next time", () => {
    const first = render(<InstallBanner />);
    fireEvent.click(screen.getByRole("button", { name: /закрыть/i }));
    expect(first.container.textContent).toBe("");
    cleanup();

    const second = render(<InstallBanner />);
    expect(second.container.textContent).toBe("");
  });
});
