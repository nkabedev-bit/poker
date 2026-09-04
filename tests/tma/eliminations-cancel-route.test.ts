import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TournamentPlayer } from "@/lib/timer/types";
import { getTargetedEliminationRollbackPlayers } from "@/lib/tma/elimination-rollback";


const mocks = vi.hoisted(() => ({
  appendFreeEntryGrant: vi.fn(),
  syncTournamentToSheets: vi.fn(),
  loadTournamentExtras: vi.fn(),
  requireTmaAuth: vi.fn(),
  saveTournamentExtras: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({
  requireTmaAuth: mocks.requireTmaAuth,
}));

vi.mock("@/lib/google-sheets", () => ({
  appendFreeEntryGrant: mocks.appendFreeEntryGrant,
  syncTournamentToSheets: mocks.syncTournamentToSheets,
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

function player(id: string, overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    addons: 0,
    bountyChipsTotal: 0,
    bountyCount: 0,
    finishPlace: null,
    id,
    name: id,
    rebuys: 0,
    seat: null,
    stack: 1000,
    status: "active",
    table: null,
    ...overrides,
  };
}

function createSupabaseMock(log: Record<string, unknown>, account: Record<string, number> | null = null) {
  const bountyLogDelete = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: null, error: null })),
    })),
  }));
  const passUpdates: unknown[] = [];

  return {
    bountyLogDelete,
    passUpdates,
    from: vi.fn((table: string) => {
      if (table === "tournaments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "tournament-1" }, error: null })),
            })),
          })),
        };
      }

      if (table === "bounty_log") {
        return {
          delete: bountyLogDelete,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: log, error: null })),
              })),
            })),
          })),
        };
      }

      if (table === "client_bot_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: account, error: null })),
            })),
          })),
          update: vi.fn((payload: unknown) => {
            passUpdates.push(payload);
            return { eq: vi.fn(async () => ({ data: payload, error: null })) };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(async (fnName: string, args: any) => {
      if (fnName === "cancel_player_elimination") {
        return { data: log.players_before, error: null };
      }
      return { data: null, error: null };
    }),
  };
}

describe("TMA elimination cancellation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("restores the exact player snapshot and deletes the bounty log row", async () => {
    const beforePlayers = [
      player("killer", { bountyChipsTotal: 0, bountyCount: 0, stack: 1000 }),
      player("out", { rebuys: 0, status: "active" }),
    ];
    const afterPlayers = [
      player("killer", { bountyChipsTotal: 200, bountyCount: 1, stack: 1200 }),
      player("out", { rebuys: 1, status: "active" }),
    ];
    const supabase = createSupabaseMock({
      id: "elim-1",
      eliminated_name: "out",
      players_before: beforePlayers,
      players_after: afterPlayers,
      tournament_id: "tournament-1",
    });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(mergeTournamentExtras({ players: afterPlayers }));

    const { POST } = await import("@/app/api/tma/eliminations/[id]/cancel/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations/elim-1/cancel", {
        method: "POST",
        body: JSON.stringify({ rowId: 12, sheetName: "22/05" }),
      }),
      { params: Promise.resolve({ id: "elim-1" }) },
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "cancel_player_elimination",
      expect.objectContaining({
        p_eliminated_id: undefined,
        p_players_before: null,
      }),
    );
    expect(supabase.bountyLogDelete).toHaveBeenCalled();
    expect(mocks.syncTournamentToSheets).toHaveBeenCalled();
  });

  // A misclick takes the mystery pass back; a knockout undone for a re-entry leaves it.
  it("takes the mystery pass back when the admin says it was a misclick", async () => {
    const killer = player("killer", { telegramId: 777 });
    const supabase = createSupabaseMock(
      {
        id: "elim-1",
        eliminated_id: "out",
        killers: [{ id: "killer", name: "Killer", share: 1, prize: { kind: "pass", pass: "vip" } }],
        tournament_id: "tournament-1",
      },
      { vip_free_entries: 2 },
    );
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(mergeTournamentExtras({ players: [killer] }));

    const { POST } = await import("@/app/api/tma/eliminations/[id]/cancel/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations/elim-1/cancel", {
        method: "POST",
        body: JSON.stringify({ revoke_passes: true }),
      }),
      { params: Promise.resolve({ id: "elim-1" }) },
    );

    expect(response.status).toBe(200);
    expect(supabase.passUpdates).toEqual([{ vip_free_entries: 1 }]);
    expect(mocks.appendFreeEntryGrant).toHaveBeenCalledWith({
      count: -1,
      nickname: "Killer",
      source: "mystery",
      vip: true,
    });
  });

  it("leaves the pass alone when the knockout is undone for a re-entry", async () => {
    const killer = player("killer", { telegramId: 777 });
    const supabase = createSupabaseMock(
      {
        id: "elim-1",
        eliminated_id: "out",
        killers: [{ id: "killer", name: "Killer", share: 1, prize: { kind: "pass", pass: "vip" } }],
        tournament_id: "tournament-1",
      },
      { vip_free_entries: 2 },
    );
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(mergeTournamentExtras({ players: [killer] }));

    const { POST } = await import("@/app/api/tma/eliminations/[id]/cancel/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations/elim-1/cancel", {
        method: "POST",
        body: JSON.stringify({ revoke_passes: false }),
      }),
      { params: Promise.resolve({ id: "elim-1" }) },
    );

    expect(response.status).toBe(200);
    expect(supabase.passUpdates).toEqual([]);
    expect(mocks.appendFreeEntryGrant).not.toHaveBeenCalled();
  });
});

describe("getTargetedEliminationRollbackPlayers helper", () => {
  it("restores standard elimination", () => {
    const players = [
      player("killer", { bountyChipsTotal: 200, bountyCount: 1, stack: 1200 }),
      player("out", { finishPlace: 4, status: "eliminated" }),
    ];
    const log = {
      eliminated_id: "out",
      finish_place: 4,
      killers: [{ bountyChips: 200, id: "killer", share: 1 }],
      uses_reentry: false,
    };
    const result = getTargetedEliminationRollbackPlayers(log, players);
    const killer = result.find(p => p.id === "killer");
    const out = result.find(p => p.id === "out");

    expect(killer?.bountyChipsTotal).toBe(0);
    expect(killer?.bountyCount).toBe(0);
    expect(killer?.stack).toBe(1000);
    expect(out?.status).toBe("active");
    expect(out?.finishPlace).toBeNull();
  });

  // Mystery Bounty pays each killer their own card, so the rollback cannot split one
  // total by share — it takes back exactly what the log says each of them got.
  it("takes back each killer's own mystery card", () => {
    const players = [
      player("a", { bountyChipsTotal: 0, bountyCount: 0.5, mysteryBountyPoints: 60, stack: 1000 }),
      player("b", { bountyChipsTotal: 100, bountyCount: 0.5, mysteryBountyPoints: 0, stack: 1100 }),
      player("out", { finishPlace: 4, status: "eliminated" }),
    ];
    const log = {
      eliminated_id: "out",
      finish_place: 4,
      killers: [
        { bountyChips: 0, id: "a", mysteryPoints: 60, share: 0.5 },
        { bountyChips: 100, id: "b", mysteryPoints: 0, share: 0.5 },
      ],
      mystery_bounty_points: 60,
      uses_reentry: false,
    };

    const result = getTargetedEliminationRollbackPlayers(log, players);

    expect(result.find((item) => item.id === "a")?.mysteryBountyPoints).toBe(0);
    expect(result.find((item) => item.id === "b")?.mysteryBountyPoints).toBe(0);
    expect(result.find((item) => item.id === "b")?.stack).toBe(1000);
  });

  it("decrements rebuys for re-entry elimination without changing status or finishPlace", () => {
    const players = [
      player("killer", { bountyChipsTotal: 200, bountyCount: 1, stack: 1200 }),
      player("out", { rebuys: 1, status: "active" }),
    ];
    const log = {
      eliminated_id: "out",
      finish_place: null,
      killers: [{ bountyChips: 200, id: "killer", share: 1 }],
      uses_reentry: true,
    };
    const result = getTargetedEliminationRollbackPlayers(log, players);
    const killer = result.find(p => p.id === "killer");
    const out = result.find(p => p.id === "out");

    expect(killer?.bountyChipsTotal).toBe(0);
    expect(killer?.bountyCount).toBe(0);
    expect(killer?.stack).toBe(1000);
    expect(out?.rebuys).toBe(0);
    expect(out?.status).toBe("active");
    expect(out?.finishPlace).toBeNull();
  });

  it("decrements doubleRebuys alongside rebuys when undoing a double re-entry", () => {
    const players = [
      player("out", { rebuys: 1, doubleRebuys: 1, status: "active" }),
    ];
    const log = {
      eliminated_id: "out",
      finish_place: null,
      killers: [],
      uses_reentry: true,
      reentry_double: true,
    };
    const result = getTargetedEliminationRollbackPlayers(log, players);
    const out = result.find(p => p.id === "out");

    expect(out?.rebuys).toBe(0);
    expect(out?.doubleRebuys).toBe(0);
    expect(out?.status).toBe("active");
  });

  it("leaves doubleRebuys untouched when undoing a single re-entry", () => {
    const players = [
      player("out", { rebuys: 2, doubleRebuys: 1, status: "active" }),
    ];
    const log = {
      eliminated_id: "out",
      finish_place: null,
      killers: [],
      uses_reentry: true,
    };
    const result = getTargetedEliminationRollbackPlayers(log, players);
    const out = result.find(p => p.id === "out");

    expect(out?.rebuys).toBe(1);
    expect(out?.doubleRebuys).toBe(1);
  });
});
