import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFavoriteHands: vi.fn(),
  loadPlayerAvatars: vi.fn(),
  readPastGames: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({ requireClientTmaAuth: mocks.requireClientTmaAuth }));
vi.mock("@/lib/results/club-games", () => ({ readPastGames: mocks.readPastGames }));
vi.mock("@/lib/players/avatars", () => ({ loadPlayerAvatars: mocks.loadPlayerAvatars }));
vi.mock("@/lib/players/favorite-hand", () => ({ loadFavoriteHands: mocks.loadFavoriteHands }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

function posters(rows: unknown[]) {
  const query = {
    in: async () => ({ data: rows, error: null }),
    select: () => query,
  };
  return { from: vi.fn(() => query) };
}

async function listGames(query: string) {
  const { GET } = await import("@/app/api/client-tma/games/route");
  const response = await GET(new Request(`http://localhost/api/client-tma/games?${query}`));
  return { body: await response.json(), status: response.status };
}

describe("the club's past games", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.loadPlayerAvatars.mockResolvedValue({
      find: ({ name }: { name?: string }) => ({ thumbUrl: name === "Chura" ? "https://club.test/c.webp" : null, url: null }),
    });
    mocks.loadFavoriteHands.mockResolvedValue({ find: () => "QsTs" });
  });

  it("lists each game with its poster, its field and its winner's face", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase: posters([{ id: "event-27", poster_url: "https://club.test/poster.webp" }]),
      user: { id: "me" },
    });
    mocks.readPastGames.mockResolvedValue({
      games: [
        {
          eventId: "event-27",
          players: 24,
          startedAt: "2026-09-27T15:00:00+00:00",
          title: "HEARTSTORM",
          winner: { name: "Chura", telegramId: 7 },
        },
        { eventId: null, players: 12, startedAt: "2026-09-25T15:00:00+00:00", title: "Вторник", winner: null },
      ],
      next: "2026-09-20T15:00:00+00:00",
    });

    const { body, status } = await listGames("scope=club");

    expect(status).toBe(200);
    expect(body).toEqual({
      games: [
        {
          players: 24,
          posterUrl: "https://club.test/poster.webp",
          startedAt: "2026-09-27T15:00:00+00:00",
          title: "HEARTSTORM",
          winner: { avatarUrl: "https://club.test/c.webp", hand: "QsTs", name: "Chura" },
        },
        { players: 12, posterUrl: null, startedAt: "2026-09-25T15:00:00+00:00", title: "Вторник", winner: null },
      ],
      next: "2026-09-20T15:00:00+00:00",
    });
  });

  it("passes on where the page should start", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: posters([]), user: { id: "me" } });
    mocks.readPastGames.mockResolvedValue({ games: [], next: null });

    await listGames(`scope=club&from=${encodeURIComponent("2026-09-20T15:00:00+00:00")}`);

    expect(mocks.readPastGames).toHaveBeenCalledWith(expect.anything(), {
      from: "2026-09-20T15:00:00+00:00",
    });
  });

  it("refuses a starting point that is not a time", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: posters([]), user: { id: "me" } });

    const { status } = await listGames("scope=club&from=вчера");

    expect(status).toBe(400);
    expect(mocks.readPastGames).not.toHaveBeenCalled();
  });
});
