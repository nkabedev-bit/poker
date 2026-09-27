import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCurrentTournamentContext: vi.fn(),
  readPlayerGames: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({ requireClientTmaAuth: mocks.requireClientTmaAuth }));
vi.mock("@/lib/client-bot/server", () => ({
  loadCurrentTournamentContext: mocks.loadCurrentTournamentContext,
}));
vi.mock("@/lib/players/profile", () => ({ readPlayerGames: mocks.readPlayerGames }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const PLAYER = { display_name: "Chura", id: "account-me", telegram_id: 101 };

/** The accounts table, recording what the route writes to it. */
function accountsSpy(error: { message: string } | null = null) {
  const writes: Array<Record<string, unknown>> = [];
  const supabase = {
    from: vi.fn(() => ({
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          writes.push(values);
          return { error };
        },
      }),
    })),
  };

  return { supabase, writes };
}

function gamesPlayed(count: number) {
  return Array.from({ length: count }, (_, index) => ({ startedAt: `game-${index}` }));
}

async function setHand(hand: unknown) {
  const { POST } = await import("@/app/api/client-tma/favorite-hand/route");
  return POST(
    new Request("http://localhost/api/client-tma/favorite-hand", {
      body: JSON.stringify({ hand }),
      method: "POST",
    }),
  );
}

describe("setting a favourite hand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.loadCurrentTournamentContext.mockResolvedValue({ extras: { playerLabels: {} } });
  });

  it("stores the two cards of a member of the club", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(5));

    const response = await setHand("QsTs");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hand: "QsTs" });
    expect(writes).toEqual([{ favorite_hand: "QsTs" }]);
  });

  it("keeps it for members: four games are not enough", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(4));

    const response = await setHand("QsTs");

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "tier_required" });
    expect(writes).toEqual([]);
  });

  // The club crowns a champion with a label, whatever the count says.
  it("lets a player the club labelled a champion pick one", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(1));
    mocks.loadCurrentTournamentContext.mockResolvedValue({
      extras: { playerLabels: { chura: "champion" } },
    });

    const response = await setHand("AhAd");

    expect(response.status).toBe(200);
    expect(writes).toEqual([{ favorite_hand: "AhAd" }]);
  });

  it("takes a hand off without counting anybody's games", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });

    const response = await setHand(null);

    expect(response.status).toBe(200);
    expect(writes).toEqual([{ favorite_hand: null }]);
    expect(mocks.readPlayerGames).not.toHaveBeenCalled();
  });

  it("refuses the same card twice, or anything that is not a hand", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(30));

    for (const hand of ["QsQs", "Q♠10♠", undefined]) {
      const response = await setHand(hand);
      expect(response.status).toBe(400);
    }
    expect(writes).toEqual([]);
  });

  it("says so plainly while the club's database cannot hold a hand yet", async () => {
    const { supabase } = accountsSpy({
      message: 'column "favorite_hand" of relation "client_bot_users" does not exist',
    });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(10));

    const response = await setHand("QsTs");

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "not_ready" });
  });
});
