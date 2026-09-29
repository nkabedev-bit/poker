/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AwardCelebration } from "@/app/client/_components/award-celebration";
import { CountUp } from "@/app/client/_components/count-up";
import { useAwardNews } from "@/app/client/_components/use-award-news";
import { EMPTY_PLAYER_STATS, getAchievements } from "@/lib/client/achievements";
import { listHeldAwards } from "@/lib/client/award-news";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

/** A screen that knows a player's achievements after this many games, as the profile does. */
function Shelf({ games }: { games: number }) {
  const held = useMemo(
    () => listHeldAwards({ achievements: getAchievements({ ...EMPTY_PLAYER_STATS, games }) }),
    [games],
  );
  const { dismiss, left, news } = useAwardNews(held, ["achievements"]);

  return news ? <AwardCelebration award={news} left={left} onDone={dismiss} /> : <p>Профиль</p>;
}

describe("a new award on the player's screen", () => {
  it("stays quiet on the first visit and remembers what the player already holds", async () => {
    render(<Shelf games={3} />);

    await waitFor(() =>
      expect(window.localStorage.getItem("club:seen-achievements")).toBe("v1:debut,first-vibe"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("celebrates the one won since, remembered at once, and lets it go on «Забрать»", async () => {
    window.localStorage.setItem("club:seen-achievements", "v1:debut");
    render(<Shelf games={3} />);

    const dialog = await screen.findByRole("dialog", { name: "Новое достижение" });
    expect(within(dialog).getByText("Первый вайб")).toBeTruthy();
    expect(window.localStorage.getItem("club:seen-achievements")).toBe("v1:debut,first-vibe");

    fireEvent.click(within(dialog).getByRole("button", { name: "Забрать" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("walks through several with «Дальше», saying how many are left", async () => {
    window.localStorage.setItem("club:seen-achievements", "v1:");
    render(<Shelf games={3} />);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Дебют!")).toBeTruthy();
    expect(within(dialog).getByText("Ещё 1 награда")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Дальше" }));
    expect(screen.getByText("Первый вайб")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Забрать" })).toBeTruthy();
  });
});

describe("a number counting up", () => {
  it("shows the value at once where the phone cannot say it may move", () => {
    render(<CountUp suffix=" / 43" value={23} />);

    expect(screen.getByText("23 / 43")).toBeTruthy();
  });

  it("starts where it is told before the first paint and lands on the value", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => frames.push(frame));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockReturnValue(0);

    const { container } = render(<CountUp from={40} value={4} />);
    expect(container.textContent).toBe("40");

    // The count waits a beat for its block to come into view, then runs for 900 ms.
    act(() => frames.shift()?.(100));
    expect(container.textContent).toBe("40");

    act(() => frames.shift()?.(600));
    const midway = Number(container.textContent);
    expect(midway).toBeLessThan(40);
    expect(midway).toBeGreaterThan(4);

    act(() => frames.shift()?.(1_100));
    expect(container.textContent).toBe("4");
  });
});
