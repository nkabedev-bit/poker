import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readLastNicknameChange: vi.fn(),
  readPlayerGames: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({ requireClientTmaAuth: mocks.requireClientTmaAuth }));
vi.mock("@/lib/client-bot/server", () => ({ loadCurrentTournamentContext: async () => null }));
vi.mock("@/lib/players/favorite-hand", () => ({ readFavoriteHand: async () => null }));
vi.mock("@/lib/players/games-played", () => ({ countGamesByNickname: async () => new Map() }));
vi.mock("@/lib/players/medal-counts", () => ({
  countMedalsFromResults: async () => ({}),
  readArchiveMedals: async () => ({}),
}));
vi.mock("@/lib/players/profile", () => ({
  buildPlayerStats: async () => ({ games: 3 }),
  readPlayerGames: mocks.readPlayerGames,
}));
vi.mock("@/lib/players/nickname-change", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/players/nickname-change")>()),
  readLastNicknameChange: mocks.readLastNicknameChange,
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const CHURA = {
  avatar_url: null,
  display_name: "Chura",
  id: "account-chura",
  medals: null,
  telegram_id: 874191714,
};

/**
 * The tables the route reads: accounts by key or by id, the journal of changes by the old
 * key, and the results by key.
 */
function database({ changes = [] as Array<{ old_key: string; user_id: string }> } = {}) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        async limit() {
          if (table === "nickname_changes") {
            return { data: changes.filter((row) => row.old_key === filters.old_key), error: null };
          }
          return { data: [], error: null };
        },
        async maybeSingle() {
          const match =
            filters.nickname_key === "chura" || filters.id === CHURA.id ? CHURA : null;
          return { data: match, error: null };
        },
        order: () => query,
        select: () => query,
      };
      return query;
    },
  };
}

async function openPlayer(key: string) {
  const { GET } = await import("@/app/api/client-tma/players/[key]/route");
  const response = await GET(new Request(`http://localhost/api/client-tma/players/${key}`), {
    params: Promise.resolve({ key }),
  });
  return { body: await response.json(), status: response.status };
}

describe("another player's profile after a nickname change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.readPlayerGames.mockResolvedValue([{ knockouts: 0, place: 1, startedAt: "2026-10-01" }]);
    mocks.readLastNicknameChange.mockResolvedValue(null);
  });

  it("shows the old nickname under the new one while the change is fresh", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: database(), user: { id: "me" } });
    mocks.readLastNicknameChange.mockResolvedValue({
      changedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      oldName: "Mr.Fish",
    });

    const { body } = await openPlayer("chura");

    expect(body.player).toMatchObject({ formerName: "Mr.Fish", name: "Chura" });
  });

  it("stops showing the old nickname once the thirty days are over", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: database(), user: { id: "me" } });
    mocks.readLastNicknameChange.mockResolvedValue({
      changedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      oldName: "Mr.Fish",
    });

    const { body } = await openPlayer("chura");

    expect(body.player.formerName).toBeNull();
  });

  it("opens the player from a link to the nickname they gave up", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase: database({ changes: [{ old_key: "mrfish", user_id: CHURA.id }] }),
      user: { id: "me" },
    });

    const { body, status } = await openPlayer("mrfish");

    expect(status).toBe(200);
    expect(body.player.name).toBe("Chura");
  });

  it("knows nobody under a nickname nobody ever had", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: database(), user: { id: "me" } });
    mocks.readPlayerGames.mockResolvedValue([]);

    const { status } = await openPlayer("ghost");

    expect(status).toBe(404);
  });
});
