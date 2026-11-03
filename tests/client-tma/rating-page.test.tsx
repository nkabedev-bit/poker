/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const tickClientSelection = vi.hoisted(() => vi.fn());

vi.mock("@/app/client/layout", () => ({
  getClientTelegramWebApp: () => null,
  tickClientSelection,
  useClientTMA: () => ({ initData: "mock-init", telegramUser: null }),
}));

const { default: ClientRatingPage } = await import("@/app/client/rating/page");

function player(place: number, name: string, eliminations: number, points: number, isMe = false) {
  return { avatarUrl: null, eliminations, games: 5, isMe, name, place, points, top9: 1 };
}

const GAMES = {
  counted: [
    { place: 1, points: 300, startedAt: "2026-10-14T16:00:00.000Z", title: "Phoenix" },
    { place: 3, points: 112, startedAt: "2026-10-28T16:00:00.000Z", title: "Deep Stack" },
  ],
  countedGames: 2,
  dropped: [{ place: 18, points: 40, startedAt: "2026-10-21T16:00:00.000Z", title: "Freeroll" }],
  next: { kind: "beat", points: 112 },
};

function serve({
  countedGames = 2,
  extraPlayers = [],
  games = async () => Response.json(GAMES),
}: {
  countedGames?: number | null;
  extraPlayers?: ReturnType<typeof player>[];
  games?: () => Promise<Response>;
} = {}) {
  const players = [
    player(1, "Mr.Shark", 31, 412),
    player(2, "River", 27, 455),
    player(3, "Ace", 22, 390, true),
    ...extraPlayers,
  ];

  const fetchMock = vi.fn(async (url: string) =>
    url.includes("/rating/games")
      ? games()
      : Response.json({
          countedGames,
          me: players[2],
          players,
          season: { id: "s1", status: "open", title: "Осень 2026" },
          seasons: [
            { id: "s1", status: "open", title: "Осень 2026" },
            { id: "s2", status: "open", title: "Отбор в Сочи" },
          ],
        }),
  );
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function rowOrder(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-row]")].map((row) => row.dataset.row);
}

afterEach(() => {
  cleanup();
  tickClientSelection.mockReset();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
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

  it("keeps the table in the order of places, with no sorting to switch", async () => {
    serve();
    const { container } = render(<ClientRatingPage />);
    await screen.findByText("Mr.Shark");

    expect(rowOrder(container)).toEqual(["1-Mr.Shark", "2-River", "3-Ace"]);
    expect(screen.queryByRole("button", { name: "По нокаутам" })).toBeNull();
    expect(screen.queryByRole("button", { name: "По рейтингу" })).toBeNull();
  });

  it("says what counts, and that a tap on a player shows it", async () => {
    serve();
    render(<ClientRatingPage />);
    await screen.findByText("Mr.Shark");

    expect(
      screen.getByText("В зачёт идут 2 лучших игр сезона. Нажмите на игрока, чтобы увидеть его игры."),
    ).toBeTruthy();
  });
});

describe("the rating — a player's games", () => {
  const FOURTH = player(4, "Nuts", 3, 100);

  async function openFourth() {
    const fetchMock = serve({ extraPlayers: [FOURTH, player(5, "Kira", 1, 90)] });
    render(<ClientRatingPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Nuts/ }));

    return { dialog: await screen.findByRole("dialog"), fetchMock };
  }

  it("opens over the table on a tap instead of leaving for the profile", async () => {
    const { dialog, fetchMock } = await openFourth();

    expect(within(dialog).getByText("4 место · 100 очков")).toBeTruthy();
    await within(dialog).findByText("Phoenix");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/client-tma/rating/games?player=nuts&season=s1"),
      expect.anything(),
    );
    expect(tickClientSelection).toHaveBeenCalled();
  });

  it("leads to the player's profile from its head", async () => {
    const { dialog } = await openFourth();

    expect(within(dialog).getByRole("link", { name: /Профиль игрока/ }).getAttribute("href")).toBe(
      "/client/players/nuts",
    );
  });

  it("opens from the podium too", async () => {
    serve({ extraPlayers: [FOURTH] });
    render(<ClientRatingPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Mr\.Shark/ }));

    expect(within(await screen.findByRole("dialog")).getByText("1 место · 412 очков")).toBeTruthy();
  });

  it("keeps the open player in the address, and clears it on closing", async () => {
    const { dialog } = await openFourth();

    expect(window.location.search).toBe("?season=s1&player=nuts");

    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("?season=s1");
  });

  it("closes on Escape and on a tap beside the sheet", async () => {
    const { dialog } = await openFourth();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Nuts/ }));
    fireEvent.click(await screen.findByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(dialog.isConnected).toBe(false);
  });

  // Back from a game the table was gone with its tab and its sheet: the rating opened on
  // the regular season and ran off to the player's own row.
  it("comes back from a game on the same tab with the same sheet, without looking for the own row", async () => {
    window.history.replaceState(null, "", "/?season=s2&player=nuts");
    const fetchMock = serve({ extraPlayers: [FOURTH, player(5, "Kira", 1, 90)] });
    const { container } = render(<ClientRatingPage />);

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Nuts")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/client-tma/rating?season=s2", expect.anything());
    expect(container.querySelector(".client-find")).toBeNull();
  });

  it("opens no sheet for a player the table does not hold", async () => {
    window.history.replaceState(null, "", "/?player=nobody");
    serve();
    render(<ClientRatingPage />);

    await screen.findByText("Mr.Shark");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers another try when the games cannot be read", async () => {
    let answer = () => Promise.resolve(new Response(null, { status: 500 }));
    serve({ extraPlayers: [FOURTH], games: () => answer() });
    render(<ClientRatingPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Nuts/ }));
    const retry = await screen.findByRole("button", { name: "Повторить" });

    answer = async () => Response.json(GAMES);
    fireEvent.click(retry);

    await waitFor(() => expect(screen.getByText("Phoenix")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  });
});
