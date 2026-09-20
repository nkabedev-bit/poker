/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnockoutOverlay } from "@/components/public/knockout-overlay";
import { KNOCKOUT_BANNER_SECONDS, type KnockoutBanner } from "@/lib/knockouts/banner";

function banner(overrides: Partial<KnockoutBanner> = {}): KnockoutBanner {
  return {
    id: "k1",
    killers: [],
    place: 9,
    player: { avatarUrl: null, name: "Чура" },
    recordedAt: new Date().toISOString(),
    reentry: null,
    ...overrides,
  };
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

/** Lets the five seconds a banner holds the board pass. */
function runBanner() {
  act(() => {
    vi.advanceTimersByTime(KNOCKOUT_BANNER_SECONDS * 1000 + 50);
  });
}

describe("KnockoutOverlay", () => {
  it("announces the player and the place they finished in", () => {
    render(<KnockoutOverlay banners={[banner()]} />);

    expect(screen.getByText("Чура")).toBeTruthy();
    expect(screen.getByText("9 место")).toBeTruthy();
  });

  it("names who knocked them out when the club records it", () => {
    render(
      <KnockoutOverlay
        banners={[banner({ killers: [{ avatarUrl: null, name: "Киллер" }] })]}
      />,
    );

    expect(screen.getByText("Киллер")).toBeTruthy();
    expect(screen.getByText("выбил")).toBeTruthy();
    expect(screen.getByText("Чура")).toBeTruthy();
  });

  it("says when the player is buying back in instead of naming a place", () => {
    render(<KnockoutOverlay banners={[banner({ place: null, reentry: { double: true } })]} />);

    expect(screen.getByText("использует ре-энтри x2")).toBeTruthy();
    expect(screen.queryByText("9 место")).toBeNull();
  });

  it("clears the board once the banner has had its seconds", () => {
    const { container } = render(<KnockoutOverlay banners={[banner()]} />);

    expect(container.querySelector(".public-knockout-overlay")).toBeTruthy();

    runBanner();

    expect(container.querySelector(".public-knockout-overlay")).toBeNull();
  });

  // Two players out on one hand: the room hears both names, one after the other.
  it("plays a second knockout after the first", () => {
    render(
      <KnockoutOverlay
        banners={[banner({ id: "k1" }), banner({ id: "k2", place: 8, player: { avatarUrl: null, name: "Второй" } })]}
      />,
    );

    expect(screen.getByText("Чура")).toBeTruthy();
    expect(screen.queryByText("Второй")).toBeNull();

    runBanner();

    expect(screen.getByText("Второй")).toBeTruthy();
    expect(screen.queryByText("Чура")).toBeNull();
  });

  // Every refresh hands the screen the same stored banners again.
  it("does not replay a knockout when the state is refreshed", () => {
    const banners = [banner()];
    const { container, rerender } = render(<KnockoutOverlay banners={banners} />);

    runBanner();
    rerender(<KnockoutOverlay banners={[...banners]} />);

    expect(container.querySelector(".public-knockout-overlay")).toBeNull();
  });

  it("shows nothing when no knockout has been recorded", () => {
    const { container } = render(<KnockoutOverlay banners={[]} />);

    expect(container.querySelector(".public-knockout-overlay")).toBeNull();
  });
});
