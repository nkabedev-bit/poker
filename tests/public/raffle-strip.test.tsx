/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RaffleStrip } from "@/components/public/raffle-strip";
import type { Raffle } from "@/lib/raffle/raffle";

const DRAW: Raffle = {
  faces: [
    { avatarUrl: "https://club.example/faces/1.jpg", name: "kabedev", number: 1 },
    { avatarUrl: null, name: "Козочка", number: 2 },
  ],
  id: "draw-1",
  kind: "regular",
  numbers: [1, 2],
  prize: "manual",
  spinSeconds: 10,
  startedAt: "2026-09-09T18:00:00.000Z",
  winnerName: "Козочка",
  winnerNumber: 2,
};

describe("RaffleStrip", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("runs the club's photo of a player who has one", () => {
    render(<RaffleStrip raffle={DRAW} />);

    const photos = screen.getAllByRole("presentation", { hidden: true });
    expect(photos.length).toBeGreaterThan(0);
    expect(photos[0].getAttribute("src")).toBe("https://club.example/faces/1.jpg");
  });

  // Somebody seated by hand has no account to keep a face on, and a closed Telegram
  // profile hands out no picture — the hall knows them by name anyway.
  it("runs the nickname of a player who has none", () => {
    render(<RaffleStrip raffle={DRAW} />);

    expect(screen.getAllByText("Козочка").length).toBeGreaterThan(1);
  });

  // The screen refreshes while the reel turns and hands over a fresh copy of the same
  // draw; the room must still be told who won.
  it("shows the winner even when the screen refreshes mid-spin", async () => {
    const { container, rerender } = render(<RaffleStrip raffle={DRAW} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    rerender(<RaffleStrip raffle={structuredClone(DRAW)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRAW.spinSeconds * 1000);
    });

    expect(container.querySelector(".raffle-result--shown")).not.toBeNull();
    expect(container.querySelector(".raffle-cell--winner")).not.toBeNull();
  });

  it("runs a new draw from the start", async () => {
    const { container, rerender } = render(<RaffleStrip raffle={DRAW} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRAW.spinSeconds * 1000 + 2000);
    });

    rerender(<RaffleStrip raffle={{ ...DRAW, id: "draw-2", kind: "vip" }} />);

    expect(container.querySelector(".raffle-result--shown")).toBeNull();
    expect(screen.getByText("VIP розыгрыш")).toBeTruthy();
  });

  // Draws taken before the reel existed carry numbers and nothing else.
  it("falls back to the numbers of an older draw", () => {
    const older: Raffle = { ...DRAW, faces: undefined };
    render(<RaffleStrip raffle={older} />);

    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.queryByRole("presentation", { hidden: true })).toBeNull();
  });

  it("names the winner once the reel has stopped", async () => {
    const { container } = render(<RaffleStrip raffle={DRAW} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRAW.spinSeconds * 1000 + 2000);
    });

    expect(container.querySelector(".raffle-result--shown")).not.toBeNull();
    expect(screen.getByText("Победил номер")).toBeTruthy();
    expect(screen.getByText("Бесплатная проходка на следующую игру")).toBeTruthy();
  });
});
