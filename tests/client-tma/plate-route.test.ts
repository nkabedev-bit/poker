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
const SECRET = { display_name: "Secret", id: "866d67e0-aa90-4170-a1f2-3bb16e344ec9", telegram_id: 6209948318 };
const SELLER = { display_name: "Seller", id: "ca9b21dc-aacc-42cf-b7dd-d2e455f31120", telegram_id: 757715517 };

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

async function setPlate(body: unknown) {
  const { POST } = await import("@/app/api/client-tma/plate/route");
  return POST(
    new Request("http://localhost/api/client-tma/plate", {
      body: JSON.stringify(body),
      method: "POST",
    }),
  );
}

describe("setting a plate for the hall's screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.loadCurrentTournamentContext.mockResolvedValue({ extras: { playerLabels: {} } });
  });

  it("stores a shape and a colour the player's tier opens", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(20));

    const response = await setPlate({ color: "sapphire", form: "chip_leader" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plate: { color: "sapphire", form: "chip_leader" } });
    expect(writes).toEqual([{ plate_color: "sapphire", plate_form: "chip_leader" }]);
  });

  it("keeps a core shape from a member and says how many games are left", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(13));

    const response = await setPlate({ color: "ruby", form: "all_in" });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "plate_locked",
      message: "Олл-ин: откроется на CORE — ещё 7 игр.",
    });
    expect(writes).toEqual([]);
  });

  // The club crowns a champion with a label, whatever the count says.
  it("opens the champion's shapes to a player the club labelled one", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(2));
    mocks.loadCurrentTournamentContext.mockResolvedValue({
      extras: { playerLabels: { chura: "champion" } },
    });

    const response = await setPlate({ color: "emerald", form: "royal_flush" });

    expect(response.status).toBe(200);
    expect(writes).toEqual([{ plate_color: "emerald", plate_form: "royal_flush" }]);
  });

  it("gives the APC plate to the cup's players only, and never keeps a colour for it", async () => {
    const seller = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: seller.supabase, user: SELLER });

    const allowed = await setPlate({ color: "ruby", form: "apc" });

    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ plate: { color: null, form: "apc" } });
    expect(seller.writes).toEqual([{ plate_color: null, plate_form: "apc" }]);
    // A plate given by name needs no count of games.
    expect(mocks.readPlayerGames).not.toHaveBeenCalled();

    const stranger = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: stranger.supabase, user: PLAYER });

    const refused = await setPlate({ form: "apc" });

    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ message: "Плашка «APC» выдаётся поимённо." });
    expect(stranger.writes).toEqual([]);
  });

  it("keeps the second place of the APC cup for Secret", async () => {
    const secret = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: secret.supabase, user: SECRET });

    expect((await setPlate({ form: "apc_second" })).status).toBe(200);
    expect(secret.writes).toEqual([{ plate_color: null, plate_form: "apc_second" }]);

    const seller = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: seller.supabase, user: SELLER });

    expect((await setPlate({ form: "apc_second" })).status).toBe(403);
    expect(seller.writes).toEqual([]);
  });

  it("goes back to the tier's plate without counting anybody's games", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });

    const response = await setPlate({ form: null });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plate: null });
    expect(writes).toEqual([{ plate_color: null, plate_form: null }]);
    expect(mocks.readPlayerGames).not.toHaveBeenCalled();
  });

  it("refuses a shape or a colour the club does not have", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(60));

    expect((await setPlate({ color: "ruby", form: "crown" })).status).toBe(400);
    expect((await setPlate({ color: "gold", form: "button" })).status).toBe(400);
    expect((await setPlate({ form: "button" })).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("says so plainly while the club's database cannot hold a plate yet", async () => {
    const { supabase } = accountsSpy({ message: 'column "plate_form" of relation "client_bot_users" does not exist' });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.readPlayerGames.mockResolvedValue(gamesPlayed(5));

    const response = await setPlate({ color: "ruby", form: "button" });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "not_ready" });
  });
});
