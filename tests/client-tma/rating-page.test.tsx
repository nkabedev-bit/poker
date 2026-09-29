/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const tickClientSelection = vi.hoisted(() => vi.fn());

vi.mock("@/app/client/layout", () => ({
  tickClientSelection,
  useClientTMA: () => ({ initData: "mock-init", telegramUser: null }),
}));

const { default: ClientRatingPage } = await import("@/app/client/rating/page");

function player(place: number, name: string, eliminations: number, points: number, isMe = false) {
  return { avatarUrl: null, eliminations, games: 5, isMe, name, place, points, top9: 1 };
}

function serve() {
  const players = [
    player(1, "Mr.Shark", 31, 412),
    player(2, "River", 27, 455),
    player(3, "Ace", 22, 390, true),
  ];

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        countedGames: null,
        me: players[2],
        players,
        season: { id: "s1", status: "open", title: "Осень 2026" },
        seasons: [{ id: "s1", status: "open", title: "Осень 2026" }],
      }),
    ),
  );
}

function rowOrder(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-row]")].map((row) => row.dataset.row);
}

afterEach(() => {
  cleanup();
  tickClientSelection.mockReset();
  vi.unstubAllGlobals();
});

describe("the rating", () => {
  it("marks the player's own row as found once the table is in", async () => {
    serve();
    const { container } = render(<ClientRatingPage />);

    await screen.findByText("Mr.Shark");

    const mine = container.querySelector<HTMLElement>('[data-me="true"]');
    expect(mine?.className).toContain("client-find");
    expect(mine?.textContent).toContain("Ace");
  });

  it("changes places on a tap of the sorting, ticking the phone once per change", async () => {
    serve();
    const { container } = render(<ClientRatingPage />);
    await screen.findByText("Mr.Shark");

    expect(rowOrder(container)).toEqual(["1-Mr.Shark", "2-River", "3-Ace"]);

    fireEvent.click(screen.getByRole("button", { name: "Рейтинг" }));
    expect(rowOrder(container)).toEqual(["2-River", "1-Mr.Shark", "3-Ace"]);
    expect(tickClientSelection).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Рейтинг" }));
    expect(tickClientSelection).toHaveBeenCalledTimes(1);
  });
});
