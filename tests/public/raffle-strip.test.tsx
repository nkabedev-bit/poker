/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RaffleStrip } from "@/components/public/raffle-strip";
import type { Raffle } from "@/lib/raffle/raffle";

const PHOTO = "https://club.example/faces/1.jpg";

const DRAW: Raffle = {
  faces: [
    { avatarUrl: PHOTO, name: "kabedev", number: 1 },
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

type Arrival = "loads" | "fails" | "hangs";

/**
 * jsdom never fetches pictures, so the reel's preload is told how each one behaves.
 * A hanging picture is what the hall's wifi did to Cloudflare-served photos: it neither
 * arrives nor fails — until `arriveLate` lets it through.
 */
function stubPictures(arrival: Arrival) {
  const late: Array<() => void> = [];

  class FakeImage {
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;

    set src(_url: string) {
      if (arrival === "hangs") {
        late.push(() => this.onload?.());
        return;
      }
      queueMicrotask(() => (arrival === "loads" ? this.onload?.() : this.onerror?.()));
    }
  }

  vi.stubGlobal("Image", FakeImage);

  return { arriveLate: () => late.forEach((arrive) => arrive()) };
}

const photos = () => screen.queryAllByRole("presentation", { hidden: true });

describe("RaffleStrip", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("runs the club's photo of a player whose photo arrives", async () => {
    stubPictures("loads");

    render(<RaffleStrip raffle={DRAW} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(photos().length).toBeGreaterThan(0);
    expect(photos()[0].getAttribute("src")).toBe(PHOTO);
  });

  it("asks the club's own domain for a photo kept in storage", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    stubPictures("loads");
    const stored: Raffle = {
      ...DRAW,
      faces: [
        {
          avatarUrl:
            "https://project.supabase.co/storage/v1/object/public/player-avatars/1.jpg?v=5",
          name: "kabedev",
          number: 1,
        },
      ],
      numbers: [1],
      winnerName: "kabedev",
      winnerNumber: 1,
    };

    render(<RaffleStrip raffle={stored} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(photos()[0].getAttribute("src")).toBe("/media/player-avatars/1.jpg?v=5");
  });

  // Somebody seated by hand has no account to keep a face on, and a closed Telegram
  // profile hands out no picture — the hall knows them by name anyway.
  it("runs the nickname of a player who has no photo", () => {
    stubPictures("loads");

    render(<RaffleStrip raffle={DRAW} />);

    expect(screen.getAllByText("Козочка").length).toBeGreaterThan(1);
  });

  it("runs the nickname of a player whose photo will not load", async () => {
    stubPictures("fails");

    render(<RaffleStrip raffle={DRAW} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(photos()).toHaveLength(0);
    expect(screen.getAllByText("kabedev").length).toBeGreaterThan(1);
  });

  // A picture popping in mid-flight reads as a broken screen.
  it("keeps the nickname of a photo that arrives after the reel has started", async () => {
    const pictures = stubPictures("hangs");

    render(<RaffleStrip raffle={DRAW} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      pictures.arriveLate();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(photos()).toHaveLength(0);
    expect(screen.getAllByText("kabedev").length).toBeGreaterThan(1);
  });

  // The screen refreshes while the reel turns and hands over a fresh copy of the same
  // draw; the room must still be told who won.
  it("shows the winner even when the screen refreshes mid-spin", async () => {
    stubPictures("loads");
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
    stubPictures("loads");
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
    stubPictures("loads");
    const older: Raffle = { ...DRAW, faces: undefined };

    render(<RaffleStrip raffle={older} />);

    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(photos()).toHaveLength(0);
  });

  it("names the winner once the reel has stopped", async () => {
    stubPictures("loads");
    const { container } = render(<RaffleStrip raffle={DRAW} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRAW.spinSeconds * 1000 + 2000);
    });

    expect(container.querySelector(".raffle-result--shown")).not.toBeNull();
    expect(screen.getByText("Победил номер")).toBeTruthy();
    expect(screen.getByText("Бесплатная проходка на следующую игру")).toBeTruthy();
  });
});
