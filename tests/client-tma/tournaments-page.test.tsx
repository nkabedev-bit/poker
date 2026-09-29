/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const tickClientSelection = vi.hoisted(() => vi.fn());

vi.mock("@/app/client/layout", () => ({
  tickClientSelection,
  useClientTMA: () => ({ initData: "mock-init" }),
}));

const { default: ClientTournamentsPage } = await import("@/app/client/tournaments/page");

function pastGame(day: number, title: string) {
  return {
    players: 20 + day,
    posterUrl: null,
    startedAt: `2026-09-${day}T15:00:00+00:00`,
    title,
    winner: { avatarUrl: null, hand: null, name: `Победитель ${day}` },
  };
}

function serve() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/client-tma/events")) return Response.json({ events: [] });
    if (url.includes("from=")) return Response.json({ games: [pastGame(10, "Старый турнир")], next: null });
    return Response.json({ games: [pastGame(26, "HEARTSTORM"), pastGame(20, "BOUNTY")], next: "2026-09-10T15:00:00+00:00" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function pastCalls(fetchMock: ReturnType<typeof serve>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes("scope=club"));
}

afterEach(() => {
  cleanup();
  tickClientSelection.mockReset();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("the tournaments tab", () => {
  it("ticks the phone when the player switches tabs, and not on the tab already open", async () => {
    serve();
    render(<ClientTournamentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Актуальные" }));
    expect(tickClientSelection).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Прошедшие" }));
    expect(tickClientSelection).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("HEARTSTORM")).toBeTruthy();
  });

  it("opens on the tournaments still ahead and reads the past only when asked", async () => {
    const fetchMock = serve();
    render(<ClientTournamentsPage />);

    expect(await screen.findByRole("button", { name: "Актуальные" })).toBeTruthy();
    expect(pastCalls(fetchMock)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Прошедшие" }));

    expect(await screen.findByText("HEARTSTORM")).toBeTruthy();
    expect(screen.getByText("Победитель 26")).toBeTruthy();
    expect(screen.getByText("46 игроков")).toBeTruthy();
    expect(screen.getAllByText("18:00")).toHaveLength(2);
    expect(pastCalls(fetchMock)).toHaveLength(1);
  });

  // The sheets gave the evening a date and nothing more; midday UTC only marks that.
  it("gives an evening imported from the sheets no start time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/client-tma/events")
          ? Response.json({ events: [] })
          : Response.json({
              games: [{ ...pastGame(10, "Игра 03.09.2026"), startedAt: "2026-09-03T12:00:00+00:00" }],
              next: null,
            }),
      ),
    );
    render(<ClientTournamentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Прошедшие" }));

    expect(await screen.findByText("Игра 03.09.2026")).toBeTruthy();
    expect(screen.getByText("3 сентября")).toBeTruthy();
    expect(screen.queryByText("15:00")).toBeNull();
  });

  it("reads older games from where the last page stopped", async () => {
    const fetchMock = serve();
    render(<ClientTournamentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Прошедшие" }));
    fireEvent.click(await screen.findByRole("button", { name: "Показать ещё" }));

    expect(await screen.findByText("Старый турнир")).toBeTruthy();
    expect(screen.getByText("HEARTSTORM")).toBeTruthy();
    expect(String(pastCalls(fetchMock)[1]?.[0])).toContain(
      `from=${encodeURIComponent("2026-09-10T15:00:00+00:00")}`,
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Показать ещё" })).toBeNull());
  });

  // Coming back from a game lands on the tab the player left.
  it("remembers the past tab in the address", async () => {
    serve();
    render(<ClientTournamentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Прошедшие" }));

    expect(window.location.search).toBe("?tab=past");
  });

  it("opens on the past tab when the address asks for it", async () => {
    window.history.replaceState(null, "", "/client/tournaments?tab=past");
    serve();
    render(<ClientTournamentsPage />);

    expect(await screen.findByText("HEARTSTORM")).toBeTruthy();
  });
});
