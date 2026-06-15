import { describe, expect, it, vi, beforeEach } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TimerState, TournamentPlayer } from "@/lib/timer/types";

const mocks = vi.hoisted(() => ({
  syncTournamentToSheets: vi.fn(),
  broadcastPublicState: vi.fn(),
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

vi.mock("@/lib/realtime/broadcast", () => ({
  broadcastPublicState: mocks.broadcastPublicState,
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

const timerStateRow = {
  status: "running",
  current_level_index: 0,
  level_started_at: null,
  paused_remaining_seconds: null,
  registration_closes_at: null,
  finished_at: null,
} satisfies Record<string, TimerState[keyof TimerState]>;

type RecordPlayerEliminationArgs = {
  p_bounty_chip_award: number;
  p_eliminated_id: string;
  p_is_bounty: boolean;
  p_killers: Array<{ id: string; name: string; share: number }>;
  p_mystery_points: number;
  p_uses_reentry: boolean;
};

function player(id: string, name: string): TournamentPlayer {
  return {
    id,
    name,
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    rebuys: 0,
    seat: null,
    stack: 1000,
    status: "active",
    table: null,
  };
}

function createSupabaseMock(options: {
  blindLevelRows?: Array<Record<string, unknown>>;
  existingBountyLog?: unknown;
  insertErrors?: Array<{ message: string }>;
  recentBountyLog?: unknown;
} = {}) {
  const timerUpdate = vi.fn((payload: unknown) => ({
    eq: vi.fn(async () => ({ data: payload, error: null })),
  }));
  const bountyLogUpdate = vi.fn((payload: unknown) => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: payload, error: null })),
    })),
  }));
  const insertPayloads: unknown[] = [];
  const createBountyLogSelectChain = () => {
    const filters: Array<[string, unknown]> = [];
    const chain = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      }),
      gte: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      }),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => {
        const clientRequestId = filters.find(([column]) => column === "client_request_id")?.[1];
        if (clientRequestId) {
          return { data: options.existingBountyLog ?? null, error: null };
        }

        const eliminatedId = filters.find(([column]) => column === "eliminated_id")?.[1];
        if (eliminatedId) {
          return { data: options.recentBountyLog ?? null, error: null };
        }

        return { data: null, error: null };
      }),
      order: vi.fn(() => chain),
    };

    return chain;
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "tournaments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "tournament-1", public_token: "public-token" },
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
              single: vi.fn(async () => ({ data: timerStateRow, error: null })),
            })),
          })),
          update: timerUpdate,
        };
      }

      if (table === "blind_levels") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: options.blindLevelRows ?? [], error: null })),
            })),
          })),
        };
      }

      if (table === "bounty_log") {
        return {
          select: vi.fn(createBountyLogSelectChain),
          insert: vi.fn((payload: unknown) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                insertPayloads.push(payload);
                const error = options.insertErrors?.shift() ?? null;
                return { data: error ? null : { id: "bounty-1" }, error };
              }),
            })),
          })),
          update: bountyLogUpdate,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    bountyLogUpdate,
    insertPayloads,
    timerUpdate,
    rpc: vi.fn(async (fnName: string, args: RecordPlayerEliminationArgs) => {
      if (fnName === "record_player_elimination") {
        const { recordPtsElimination } = await import("@/lib/pts-rating");
        const extras = await mocks.loadTournamentExtras("tournament-1", null);
        const res = recordPtsElimination({
          bountyChipAward: args.p_bounty_chip_award,
          eliminatedId: args.p_eliminated_id,
          isBounty: args.p_is_bounty,
          killers: args.p_killers,
          mysteryPoints: args.p_mystery_points,
          players: extras.players,
          usesReentry: args.p_uses_reentry,
        });
        return {
          data: {
            players: res.players,
            finishPlace: res.finishPlace,
            tournamentFinished: res.tournamentFinished,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    }),
  };
}

describe("TMA eliminations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncTournamentToSheets.mockResolvedValue(undefined);
  });

  it("clears players when the final elimination finishes the tournament", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("winner", "Winner"), player("out", "Out")],
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({ eliminated_id: "out" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({
        p_eliminated_id: "out",
      }),
    );
    expect(supabase.timerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        current_level_index: 0,
        status: "finished",
      }),
    );
    expect(mocks.saveTournamentExtras).toHaveBeenCalledWith(
      { players: [] },
      "/admin/players",
      supabase,
    );

    // Achievement stats must be counted from the final standings BEFORE the
    // roster is wiped, otherwise accumulate_client_bot_stats reads an empty list.
    const accumulateRpcIndex = supabase.rpc.mock.calls.findIndex(
      ([fnName]) => fnName === "accumulate_client_bot_stats",
    );
    expect(accumulateRpcIndex).toBeGreaterThanOrEqual(0);
    const accumulateOrder = supabase.rpc.mock.invocationCallOrder[accumulateRpcIndex];
    const clearPlayersOrder = mocks.saveTournamentExtras.mock.invocationCallOrder[0];
    expect(accumulateOrder).toBeLessThan(clearPlayersOrder);
  });

  it("ignores requested re-entry when re-entry is disabled", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("a", "A"), player("b", "B"), player("out", "Out")],
        settings: {
          reentryEnabled: false,
        },
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({ eliminated_id: "out", uses_reentry: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({
        p_eliminated_id: "out",
        p_uses_reentry: false,
      }),
    );
    expect(mocks.syncTournamentToSheets).toHaveBeenCalled();
  });

  it("ignores requested re-entry when the player reached the re-entry limit", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          player("a", "A"),
          player("b", "B"),
          { ...player("out", "Out"), rebuys: 2 },
        ],
        settings: {
          maxReentries: 2,
          reentryEnabled: true,
        },
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({ eliminated_id: "out", uses_reentry: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({
        p_eliminated_id: "out",
        p_uses_reentry: false,
      }),
    );
    expect(mocks.syncTournamentToSheets).toHaveBeenCalled();
  });

  it("rejects duplicate elimination when the player is no longer active", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          player("a", "A"),
          player("b", "B"),
          { ...player("out", "Out"), status: "eliminated", finishPlace: 3 },
        ],
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({ eliminated_id: "out" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.saveTournamentExtras).not.toHaveBeenCalled();
    expect(mocks.syncTournamentToSheets).not.toHaveBeenCalled();
  });

  it("returns the existing elimination when the client request id was already recorded", async () => {
    const supabase = createSupabaseMock({ existingBountyLog: { id: "bounty-existing" } });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({ client_request_id: "request-1", eliminated_id: "out", uses_reentry: true }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ duplicate: true, elimination: { id: "bounty-existing" } });
    expect(mocks.loadTournamentExtras).not.toHaveBeenCalled();
    expect(mocks.saveTournamentExtras).not.toHaveBeenCalled();
    expect(mocks.syncTournamentToSheets).not.toHaveBeenCalled();
  });

  it("returns the recent elimination when the same player was recorded in the last 30 seconds", async () => {
    const supabase = createSupabaseMock({ recentBountyLog: { id: "bounty-recent", eliminated_id: "out" } });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({ eliminated_id: "out", uses_reentry: false }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ duplicate: true, elimination: { id: "bounty-recent", eliminated_id: "out" } });
    expect(mocks.loadTournamentExtras).not.toHaveBeenCalled();
    expect(mocks.saveTournamentExtras).not.toHaveBeenCalled();
    expect(mocks.syncTournamentToSheets).not.toHaveBeenCalled();
  });

  it("retries bounty log insert without snapshot columns when the database migration is not deployed yet", async () => {
    const supabase = createSupabaseMock({
      insertErrors: [{ message: "Could not find the 'players_before' column of 'bounty_log'" }],
    });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("a", "A"), player("b", "B"), player("out", "Out")],
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({ eliminated_id: "out" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.insertPayloads).toHaveLength(2);
    expect(supabase.insertPayloads[0]).toMatchObject({
      players_after: expect.any(Array),
      players_before: expect.any(Array),
      uses_reentry: false,
    });
    expect(supabase.insertPayloads[1]).not.toHaveProperty("players_after");
    expect(supabase.insertPayloads[1]).not.toHaveProperty("players_before");
    expect(supabase.insertPayloads[1]).not.toHaveProperty("uses_reentry");
    expect(supabase.insertPayloads[1]).not.toHaveProperty("mystery_bounty_points");
  });

  it("dealer revenge: auto-awards dealer knockout points when the eliminated player carries the dealer label", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          player("killer", "Killer"),
          player("other", "Other"),
          { ...player("dealer", "Дилер Вася"), label: "дилер" },
        ],
        settings: { isBounty: true, bountyType: "dealer" },
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({
          eliminated_id: "dealer",
          killers: [{ id: "killer", name: "Killer", share: 1 }],
          // The client never decides dealer points — a stale/garbage value must be ignored.
          mystery_bounty_points: 999,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({
        p_eliminated_id: "dealer",
        p_mystery_points: 60,
      }),
    );
  });

  it("dealer revenge: detects the dealer via the persistent per-nickname label store", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("killer", "Killer"), player("other", "Other"), player("dealer", "Дилер Вася")],
        playerLabels: { "дилер вася": "дилер" },
        settings: { isBounty: true, bountyType: "dealer" },
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({
          eliminated_id: "dealer",
          killers: [{ id: "killer", name: "Killer", share: 1 }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({ p_mystery_points: 60 }),
    );
  });

  it("dealer revenge: a regular knockout awards no points even if the client sends some", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("killer", "Killer"), player("other", "Other"), player("out", "Out")],
        settings: { isBounty: true, bountyType: "dealer" },
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({
          eliminated_id: "out",
          killers: [{ id: "killer", name: "Killer", share: 1 }],
          mystery_bounty_points: 999,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({ p_mystery_points: 0 }),
    );
  });

  it("mystery mode still passes the admin-entered mystery points through", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("killer", "Killer"), player("other", "Other"), player("out", "Out")],
        settings: { isBounty: true, bountyType: "mystery" },
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({
          eliminated_id: "out",
          killers: [{ id: "killer", name: "Killer", share: 1 }],
          mystery_bounty_points: 120,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({ p_mystery_points: 120 }),
    );
  });

  const bigBlindLevelRows = [
    {
      id: "level-1",
      level_order: 1,
      small_blind: 50,
      big_blind: 100,
      ante: 0,
      reentry_closes: false,
      double_reentry_available: false,
      duration_seconds: 1200,
      is_break: false,
      break_duration_seconds: 0,
    },
  ];

  it("standard bounty: awards the 2-big-blind stack reward to the killer", async () => {
    const supabase = createSupabaseMock({ blindLevelRows: bigBlindLevelRows });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("killer", "Killer"), player("other", "Other"), player("out", "Out")],
        settings: { isBounty: true, bountyType: "standard" },
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({
          eliminated_id: "out",
          killers: [{ id: "killer", name: "Killer", share: 1 }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    // 100 BB × 2 (no break before the current level) = 200 chips.
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({ p_bounty_chip_award: 200 }),
    );
  });

  it("mystery mode: no 2-big-blind stack reward (side points only)", async () => {
    const supabase = createSupabaseMock({ blindLevelRows: bigBlindLevelRows });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("killer", "Killer"), player("other", "Other"), player("out", "Out")],
        settings: { isBounty: true, bountyType: "mystery" },
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({
          eliminated_id: "out",
          killers: [{ id: "killer", name: "Killer", share: 1 }],
          mystery_bounty_points: 120,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({ p_bounty_chip_award: 0 }),
    );
  });

  it("dealer revenge: no 2-big-blind stack reward (side points only)", async () => {
    const supabase = createSupabaseMock({ blindLevelRows: bigBlindLevelRows });
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          player("killer", "Killer"),
          player("other", "Other"),
          { ...player("dealer", "Дилер Вася"), label: "дилер" },
        ],
        settings: { isBounty: true, bountyType: "dealer" },
      }),
    );

    const { POST } = await import("@/app/api/tma/eliminations/route");
    const response = await POST(
      new Request("http://localhost/api/tma/eliminations", {
        method: "POST",
        body: JSON.stringify({
          eliminated_id: "dealer",
          killers: [{ id: "killer", name: "Killer", share: 1 }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_player_elimination",
      expect.objectContaining({ p_bounty_chip_award: 0, p_mystery_points: 60 }),
    );
  });
});
