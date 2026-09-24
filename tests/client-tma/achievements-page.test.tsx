/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACHIEVEMENTS_TOTAL } from "@/lib/client/achievements";

vi.mock("@/app/client/layout", () => ({
  useClientTMA: () => ({ initData: "mock-init", telegramUser: null }),
}));

const { default: ClientAchievementsPage } = await import("@/app/client/achievements/page");

type Rarity = { holders: Record<string, number>; players: number };

/** The player's own numbers, and — asked for apart — how rare each badge is in the club. */
function respondWithStats(stats: Record<string, number>, rarity: Rarity | null = null) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/client-tma/achievements") {
      return rarity ? Response.json(rarity) : new Response(null, { status: 500 });
    }

    return Response.json({ stats });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("client mini-app: достижения", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists every section of the club's collection", async () => {
    respondWithStats({});

    render(<ClientAchievementsPage />);

    for (const title of [
      "Посещение игр",
      "Попадания в топ-3",
      "Победы",
      "Специальные достижения",
      "Попади в топ-9",
    ]) {
      expect(await screen.findByText(title)).toBeTruthy();
    }
  });

  it("counts what the player has earned in the header", async () => {
    respondWithStats({ games: 3 });

    render(<ClientAchievementsPage />);

    // Дебют! and Первый вайб out of the full list.
    expect(await screen.findByText(new RegExp(`2 / ${ACHIEVEMENTS_TOTAL}`))).toBeTruthy();
  });

  it("shows progress towards a goal that is still ahead", async () => {
    respondWithStats({ top3: 3 });

    render(<ClientAchievementsPage />);

    expect(await screen.findByText("Серьёзный соперник")).toBeTruthy();
    expect(screen.getByText("10 раз")).toBeTruthy();
    expect(screen.getByText("3 / 10")).toBeTruthy();
  });

  it("keeps half a knockout visible instead of rounding it away", async () => {
    respondWithStats({ bestTournamentBounty: 4.5 });

    render(<ClientAchievementsPage />);

    expect(await screen.findByText("4.5 / 5")).toBeTruthy();
  });

  it("shows how rare each badge is across the club", async () => {
    respondWithStats({ games: 1 }, { holders: { debut: 8, "first-trophy": 1 }, players: 8 });

    render(<ClientAchievementsPage />);

    expect(await screen.findByText("Есть у 100% игроков")).toBeTruthy();
    expect(screen.getByText("Есть у 12,5% игроков")).toBeTruthy();
    // Every badge nobody holds says so, the other twenty of them.
    expect(screen.getAllByText("Пока ни у кого")).toHaveLength(ACHIEVEMENTS_TOTAL - 2);
  });

  it("stands without the rarity when it does not load", async () => {
    const fetchMock = respondWithStats({ games: 1 });

    render(<ClientAchievementsPage />);

    expect(await screen.findByText("Дебют!")).toBeTruthy();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/client-tma/achievements", expect.anything()),
    );
    // Let the failed answer settle before looking for what it would have drawn.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/игроков$/)).toBeNull();
    expect(screen.queryByText("Пока ни у кого")).toBeNull();
  });

  it("opens the players who hold a badge on tap", async () => {
    respondWithStats({});

    render(<ClientAchievementsPage />);

    expect((await screen.findByText("Коллекционер титулов")).closest("a")?.getAttribute("href")).toBe(
      "/client/achievements/title-collector",
    );
  });

  it("falls back to an empty collection when the stats do not load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    render(<ClientAchievementsPage />);

    await waitFor(() =>
      expect(screen.getByText(new RegExp(`0 / ${ACHIEVEMENTS_TOTAL}`))).toBeTruthy(),
    );
  });
});
