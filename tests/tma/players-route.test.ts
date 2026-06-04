import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";

const mocks = vi.hoisted(() => ({
  syncTournamentToSheets: vi.fn(),
  loadTournamentExtras: vi.fn(),
  requireTmaAuth: vi.fn(),
  saveTournamentExtras: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({
  requireTmaAuth: mocks.requireTmaAuth,
}));

vi.mock("@/lib/google-sheets", () => ({
  syncTournamentToSheets: mocks.syncTournamentToSheets,
}));

vi.mock("@/lib/tournament-extras", () => ({
  loadTournamentExtras: mocks.loadTournamentExtras,
  saveTournamentExtras: mocks.saveTournamentExtras,
}));

vi.mock("@/lib/realtime/broadcast", () => ({
  broadcastPublicState: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
  after: (fn: () => void) => {
    fn();
  },
}));

function createSupabaseMock() {
  const bountyLogDelete = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: null, error: null })),
    })),
  }));
  const bountyLogUpdate = vi.fn((payload: unknown) => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: payload, error: null })),
    })),
  }));
  const bountyLogRows: unknown[] = [];

  return {
    bountyLogDelete,
    bountyLogRows,
    bountyLogUpdate,
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

      if (table === "bounty_log") {
        return {
          delete: bountyLogDelete,
          select: vi.fn(() => {
            const chain = {
              eq: vi.fn(() => chain),
              limit: vi.fn(() => chain),
              maybeSingle: vi.fn(async () => ({
                data: bountyLogRows[0] ?? null,
                error: null,
              })),
              order: vi.fn(() => chain),
            };
            return chain;
          }),
          update: bountyLogUpdate,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(async (fnName: string, args: any) => {
      if (fnName === "delete_tournament_player") {
        return { data: [], error: null };
      }
      if (fnName === "move_tournament_player") {
        return {
          data: {
            id: args.p_player_id,
            table: args.p_table,
            name: "Player 1",
            status: "active",
            seat: 1,
            stack: 1000,
            rebuys: 0,
            addons: 0,
            bountyCount: 0,
          },
          error: null,
        };
      }
      if (fnName === "add_tournament_player_addon") {
        return {
          data: {
            id: args.p_player_id,
            addons: 1,
            addonChipsTotal: args.p_chips,
            stack: 1000 + args.p_chips,
            name: "Player 1",
            status: "active",
            seat: 1,
            rebuys: 0,
            bountyCount: 0,
          },
          error: null,
        };
      }
      if (fnName === "cancel_player_elimination") {
        return {
          data: [
            { id: "killer", bountyChipsTotal: 0, bountyCount: 0, stack: 1000, status: "active", name: "Killer", rebuys: 0, seat: 1 },
            { id: "player-out", finishPlace: null, status: "active", name: "Player Out", rebuys: 0, seat: 2, stack: 1000 },
            { id: "later-out", finishPlace: 4, status: "eliminated", name: "Later Out", rebuys: 0, seat: 3, stack: 1000 },
          ],
          error: null,
        };
      }
      if (fnName === "append_tournament_player") {
        return {
          data: {
            ...args.p_player,
            registrationNumber: 2,
            table: args.p_table_number,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    }),
  };
}

function createSupabaseMockWithMissingAppendRpc() {
  const base = createSupabaseMock();
  return {
    ...base,
    rpc: vi.fn(async (fnName: string, args: any) => {
      if (fnName === "append_tournament_player") {
        return {
          data: null,
          error: {
            code: "PGRST202",
            message: "Could not find the function public.append_tournament_player",
          },
        };
      }
      return base.rpc(fnName, args);
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
    expect(supabase.rpc).toHaveBeenCalledWith(
      "move_tournament_player",
      {
        p_tournament_id: "tournament-1",
        p_player_id: "player-1",
        p_table: 3,
      },
    );
  });

  it("assigns a registration number when an admin adds a player", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        settings: {
          maxPlayersPerTable: 10,
          tablesCount: 3,
        },
        players: [
          {
            id: "player-1",
            addons: 0,
            bountyCount: 0,
            finishPlace: null,
            name: "Player 1",
            rebuys: 0,
            registrationNumber: 1,
            seat: 1,
            stack: 1000,
            status: "active",
            table: 1,
          },
        ],
      }),
    );

    const { POST } = await import("@/app/api/tma/players/route");
    const response = await POST(
      new Request("http://localhost/api/tma/players", {
        method: "POST",
        body: JSON.stringify({ name: "Player 2", table: 1, seat: 1 }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.player.registrationNumber).toBe(2);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "append_tournament_player",
      expect.objectContaining({
        p_player: expect.objectContaining({
          name: "Player 2",
        }),
      }),
    );
  });

  it("falls back to saving extras when the registration number RPC is not deployed yet", async () => {
    const supabase = createSupabaseMockWithMissingAppendRpc();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        settings: {
          maxPlayersPerTable: 10,
          tablesCount: 3,
        },
        players: [],
      }),
    );

    const { POST } = await import("@/app/api/tma/players/route");
    const response = await POST(
      new Request("http://localhost/api/tma/players", {
        method: "POST",
        body: JSON.stringify({ name: "Fallback Player", table: 3, seat: 1 }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.player.registrationNumber).toBe(19);
    expect(data.player.category).toBe("VIP");
    expect(supabase.rpc).toHaveBeenCalledWith(
      "append_tournament_player",
      expect.any(Object),
    );
    expect(mocks.saveTournamentExtras).toHaveBeenCalledWith(
      {
        players: [
          expect.objectContaining({
            name: "Fallback Player",
            registrationNumber: 19,
            category: "VIP",
          }),
        ],
      },
      "/tma/players",
      supabase,
    );
  });

  it("returns a full-capacity message when an admin adds a player after seats run out", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        settings: {
          maxPlayersPerTable: 2,
          tablesCount: 2,
        },
        players: [
          { id: "player-1", name: "Player 1", table: 1, seat: 1, stack: 1000, status: "active" },
          { id: "player-2", name: "Player 2", table: 1, seat: 2, stack: 1000, status: "active" },
          { id: "player-3", name: "Player 3", table: 2, seat: 1, stack: 1000, status: "active" },
          { id: "player-4", name: "Player 4", table: 2, seat: 2, stack: 1000, status: "active" },
        ],
      }),
    );

    const { POST } = await import("@/app/api/tma/players/route");
    const response = await POST(
      new Request("http://localhost/api/tma/players", {
        method: "POST",
        body: JSON.stringify({ name: "Late Player", table: 1, seat: 1 }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Уже зарегистрировано 4 игроков. Мест больше нет");
    expect(mocks.saveTournamentExtras).not.toHaveBeenCalled();
  });

  it("restores an eliminated player and shifts later finish places down", async () => {
    const supabase = createSupabaseMock();
    supabase.bountyLogRows.push({
      eliminated_id: "player-out",
      finish_place: 4,
      id: "elim-out",
      killers: [{ bountyChips: 100, id: "killer", share: 1 }],
      sheets_row_id: 4,
      sheets_sheet_name: "22/05",
    });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          {
            id: "killer",
            addons: 0,
            bountyChipsTotal: 100,
            bountyCount: 1,
            finishPlace: null,
            name: "Killer",
            rebuys: 0,
            seat: 1,
            stack: 1100,
            status: "active",
            table: 1,
          },
          {
            id: "player-out",
            addons: 0,
            bountyCount: 0,
            finishPlace: 4,
            name: "Player Out",
            rebuys: 0,
            seat: 2,
            stack: 1000,
            status: "eliminated",
            table: 1,
          },
          {
            id: "later-out",
            addons: 0,
            bountyCount: 0,
            finishPlace: 3,
            name: "Later Out",
            rebuys: 0,
            seat: 3,
            stack: 1000,
            status: "eliminated",
            table: 1,
          },
        ],
      }),
    );

    const { PATCH } = await import("@/app/api/tma/players/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/tma/players/player-out", {
        method: "PATCH",
        body: JSON.stringify({ action: "restore_player" }),
      }),
      { params: Promise.resolve({ id: "player-out" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.player).toMatchObject({
      finishPlace: null,
      id: "player-out",
      status: "active",
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "cancel_player_elimination",
      {
        p_tournament_id: "tournament-1",
        p_eliminated_id: "player-out",
        p_finish_place: 4,
        p_killers: [{ bountyChips: 100, id: "killer", share: 1 }],
        p_mystery_points: 0,
        p_uses_reentry: false,
        p_players_before: null,
      },
    );
    expect(supabase.bountyLogDelete).toHaveBeenCalled();
    expect(mocks.syncTournamentToSheets).toHaveBeenCalled();
  });
});
