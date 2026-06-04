import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";

const mocks = vi.hoisted(() => ({
  loadTournamentExtras: vi.fn(),
  requireTmaAuth: vi.fn(),
  saveTournamentExtras: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({
  requireTmaAuth: mocks.requireTmaAuth,
}));

vi.mock("@/lib/tournament-extras", () => ({
  loadTournamentExtras: mocks.loadTournamentExtras,
  saveTournamentExtras: mocks.saveTournamentExtras,
}));

function createSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "tournaments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "tournament-1" },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "timer_state") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }

      if (table === "blind_levels") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("TMA players route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns table count from tournament settings", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        settings: {
          tablesCount: 4,
        },
      }),
    );

    const { GET } = await import("@/app/api/tma/players/route");
    const response = await GET(new Request("http://localhost/api/tma/players"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tablesCount).toBe(4);
    expect(mocks.loadTournamentExtras).toHaveBeenCalledWith("tournament-1", supabase);
  });

  it("moves a player to another table", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        settings: {
          tablesCount: 4,
        },
        players: [
          {
            id: "player-1",
            addons: 0,
            addonChipsTotal: 0,
            bountyCount: 0,
            finishPlace: null,
            name: "Player 1",
            rebuys: 0,
            seat: 1,
            stack: 1000,
            status: "active",
            table: 1,
          },
        ],
      }),
    );

    const { PATCH } = await import("@/app/api/tma/players/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/tma/players/player-1", {
        method: "PATCH",
        body: JSON.stringify({ action: "move_table", table: 3 }),
      }),
      { params: Promise.resolve({ id: "player-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.player.table).toBe(3);
    expect(mocks.saveTournamentExtras).toHaveBeenCalledWith(
      {
        players: [
          expect.objectContaining({
            id: "player-1",
            table: 3,
          }),
        ],
      },
      "/tma/players",
      supabase,
    );
  });
});
