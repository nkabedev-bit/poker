import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TournamentPlayer } from "@/lib/timer/types";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";

const mocks = vi.hoisted(() => ({
  loadTournamentExtras: vi.fn(),
  requireTmaAuth: vi.fn(),
  saveTournamentExtras: vi.fn(),
  syncFinanceSheetForTournament: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));
vi.mock("@/lib/google-sheets", () => ({
  syncFinanceSheetForTournament: mocks.syncFinanceSheetForTournament,
}));
vi.mock("@/lib/tournament-extras", () => ({
  loadTournamentExtras: mocks.loadTournamentExtras,
  saveTournamentExtras: mocks.saveTournamentExtras,
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
  after: (fn: () => void) => {
    fn();
  },
}));

const { POST } = await import("@/app/api/tma/cards/paid/route");

function player(overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    cardCode: "A12",
    finishPlace: null,
    id: "player-1",
    name: "TitAn",
    rebuys: 0,
    seat: 1,
    stack: 20000,
    status: "active",
    table: 1,
    ...overrides,
  };
}

function supabaseMock(rpc: { data: unknown; error: unknown }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: "tournament-1" }, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(async () => rpc),
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/tma/cards/paid", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/tma/cards/paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({ players: [player()] }),
    );
  });

  it("writes the tick through to the money tab", async () => {
    const supabase = supabaseMock({ data: player({ paid: true }), error: null });
    mocks.requireTmaAuth.mockResolvedValue({ error: null, supabase });

    const response = await POST(request({ cardCode: "A12", paid: true }));

    expect(response.status).toBe(200);
    expect(mocks.syncFinanceSheetForTournament).toHaveBeenCalledWith(supabase, "tournament-1");
  });

  // The sheet is written after the answer is sent, and the desk has a queue: a broken
  // spreadsheet must not turn a saved payment into an error.
  it("still confirms the payment when the sheet cannot be written", async () => {
    const supabase = supabaseMock({ data: player({ paid: true }), error: null });
    mocks.requireTmaAuth.mockResolvedValue({ error: null, supabase });
    mocks.syncFinanceSheetForTournament.mockRejectedValue(new Error("no access"));

    const response = await POST(request({ cardCode: "A12", paid: true }));

    expect(response.status).toBe(200);
  });

  it("leaves the sheet alone when the payment was not saved", async () => {
    const supabase = supabaseMock({ data: null, error: { code: "PGRST202", message: "set_player_paid" } });
    mocks.requireTmaAuth.mockResolvedValue({ error: null, supabase });

    const response = await POST(request({ cardCode: "A12", paid: true }));

    expect(response.status).toBe(500);
    expect(mocks.syncFinanceSheetForTournament).not.toHaveBeenCalled();
  });
});

// After the tournament the room is empty and the desk settles from a copy of the roster.
// Writing that copy back whole meant two ticks in a row undid each other: the player the
// first one marked paid was a debtor again a second later.
describe("settling up after the tournament", () => {
  const settled = player({ id: "player-9", name: "Late", paid: false });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [],
        settling: { closesAt: "2026-09-08T23:00:00.000Z", players: [settled] },
      }),
    );
  });

  it("patches one player in the copy instead of writing the copy back", async () => {
    const supabase = supabaseMock({ data: { ...settled, paid: true }, error: null });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 1 });

    const response = await POST(request({ playerId: "player-9", paid: true }));

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith("set_settling_player_paid", {
      p_paid: true,
      p_player_id: "player-9",
      p_tournament_id: "tournament-1",
    });
  });

  // The function is applied by hand, so a deploy can land before it exists.
  it("falls back to writing the copy while the function is missing", async () => {
    const supabase = supabaseMock({ data: null, error: { code: "PGRST202" } });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 1 });

    const response = await POST(request({ playerId: "player-9", paid: true }));

    expect(response.status).toBe(200);
    expect(mocks.saveTournamentExtras).toHaveBeenCalled();
  });
});
