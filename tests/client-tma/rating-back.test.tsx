/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/client/layout", () => ({
  useClientTMA: () => ({ initData: "mock-init", telegramUser: null }),
}));

const { default: ClientRatingPage } = await import("@/app/client/rating/page");

describe("client mini-app: рейтинг", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          me: { name: "Я", place: 1, eliminations: 0, points: 0, isMe: true },
          players: [],
          pointsAvailable: true,
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers a way back — the rating has no tab of its own", async () => {
    const history = window.history;
    // jsdom starts with a single entry; the player arrives here from another screen.
    Object.defineProperty(window, "history", { configurable: true, value: { length: 2 } });

    render(<ClientRatingPage />);

    fireEvent.click(await screen.findByRole("button", { name: /назад/i }));

    expect(router.back).toHaveBeenCalled();

    Object.defineProperty(window, "history", { configurable: true, value: history });
  });

  it("falls back to the home screen when there is nothing to go back to", async () => {
    const history = window.history;
    Object.defineProperty(window, "history", { configurable: true, value: { length: 1 } });

    render(<ClientRatingPage />);
    fireEvent.click(await screen.findByRole("button", { name: /назад/i }));

    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/client");

    Object.defineProperty(window, "history", { configurable: true, value: history });
  });
});
