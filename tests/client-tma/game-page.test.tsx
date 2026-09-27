/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useParams: () => ({ startedAt: "2026-09-26T15:10:00.000Z" }) }));
vi.mock("@/app/client/layout", () => ({ useClientTMA: () => ({ initData: "mock-init" }) }));

const { default: ClientGamePage } = await import("@/app/client/games/[startedAt]/page");

function row(place: number | null, playerName: string, extra: Record<string, unknown> = {}) {
  return {
    avatarUrl: null,
    hand: null,
    isMe: false,
    knockouts: 1,
    place,
    playerName,
    points: 100 - (place ?? 50),
    tier: null,
    ...extra,
  };
}

function serve(rows: unknown[], game: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        game: {
          countsForRating: true,
          playedOn: "2026-09-26",
          startedAt: "2026-09-26T15:10:00.000Z",
          title: "HEARTSTORM TOURNEY X2",
          ...game,
        },
        rows,
      }),
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a past game", () => {
  it("says when it ran and how many played, before anything else", async () => {
    serve([row(1, "Chura"), row(2, "Vera"), row(3, "Fil"), row(4, "Ghost")]);
    render(<ClientGamePage />);

    expect(await screen.findByText("HEARTSTORM TOURNEY X2")).toBeTruthy();
    expect(screen.getByText("26 сентября")).toBeTruthy();
    expect(screen.getByText("суббота")).toBeTruthy();
    expect(screen.getByText("18:10")).toBeTruthy();
    expect(screen.getByText("Игроки").parentElement?.textContent).toContain("4");
    expect(screen.getByText("Завершён")).toBeTruthy();
  });

  // Read the way the room sees a podium: second, first, third.
  it("stands the first three on the podium and starts the table at fourth", async () => {
    serve([row(1, "Chura"), row(2, "Vera"), row(3, "Fil"), row(4, "Ghost"), row(5, "Pauli")]);
    const { container } = render(<ClientGamePage />);

    await screen.findByText("Результаты");
    const podium = container.querySelector(".grid.grid-cols-3.items-end") as HTMLElement;
    expect([...podium.querySelectorAll("a")].map((link) => link.textContent?.match(/Chura|Vera|Fil/)?.[0])).toEqual([
      "Vera",
      "Chura",
      "Fil",
    ]);

    const tableNames = [...container.querySelectorAll("section.space-y-2 a")].map(
      (link) => within(link as HTMLElement).getByText(/Ghost|Pauli|Chura|Vera|Fil/).textContent,
    );
    expect(tableNames).toEqual(["Ghost", "Pauli"]);
  });

  it("shows everybody in the table when the game kept no places", async () => {
    serve([row(null, "Old One"), row(null, "Old Two")]);
    const { container } = render(<ClientGamePage />);

    await screen.findByText("Old One");
    expect(screen.queryByText("Результаты")).toBeNull();
    expect(container.querySelectorAll("section.space-y-2 a")).toHaveLength(2);
  });

  // The sheets gave the evening a date and nothing more; midday UTC only marks that.
  it("does not invent a start time for a game imported from the sheets", async () => {
    serve([row(null, "Old One")], { playedOn: "2026-04-12", startedAt: "2026-04-12T12:00:00+00:00" });
    render(<ClientGamePage />);

    expect(await screen.findByText("12 апреля")).toBeTruthy();
    expect(screen.queryByText("Начало")).toBeNull();
    expect(screen.queryByText("15:00")).toBeNull();
  });

  it("marks a game that did not count for the rating", async () => {
    serve([row(1, "Chura")], { countsForRating: false });
    render(<ClientGamePage />);

    expect(await screen.findByText("Вне рейтинга")).toBeTruthy();
  });
});
