import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterResponse: [] as Array<() => unknown>,
  broadcastPublicState: vi.fn(),
  grantWinnerPass: vi.fn(),
  loadCurrentTournamentContext: vi.fn(),
  requireTmaAuth: vi.fn(),
  saveTournamentExtrasFromContext: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({
  requireTmaAuth: mocks.requireTmaAuth,
}));

vi.mock("@/lib/realtime/broadcast", () => ({
  broadcastPublicState: mocks.broadcastPublicState,
}));

vi.mock("@/lib/client-bot/server", () => ({
  loadCurrentTournamentContext: mocks.loadCurrentTournamentContext,
  saveTournamentExtrasFromContext: mocks.saveTournamentExtrasFromContext,
}));

vi.mock("@/lib/free-entries/winner-pass", () => ({
  grantWinnerPass: mocks.grantWinnerPass,
}));

vi.mock("next/server", () => ({
  after: (task: () => unknown) => {
    mocks.afterResponse.push(task);
  },
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

vi.mock("@/lib/results/store", () => ({
  saveTournamentResults: vi.fn(async () => {}),
}));

const timerStateRow = {
  status: "finished",
  current_level_index: 4,
  level_started_at: "2026-05-19T10:00:00.000Z",
  paused_remaining_seconds: null,
  registration_closes_at: null,
  finished_at: "2026-05-19T11:00:00.000Z",
};

function createSupabaseMock(status = timerStateRow.status) {
  const timerUpdate = vi.fn((payload: unknown) => ({
    eq: vi.fn(async () => ({ data: payload, error: null })),
  }));

  return {
    from: vi.fn((table: string) => {
      if (table === "tournaments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "tournament-1",
                  public_token: "public-token",
                  registration_minutes: 90,
                },
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
              single: vi.fn(async () => ({ data: { ...timerStateRow, status }, error: null })),
            })),
          })),
          update: timerUpdate,
        };
      }

      if (table === "blind_levels") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [
                  {
                    id: "level-1",
                    level_order: 1,
                    small_blind: 100,
                    big_blind: 200,
                    ante: 0,
                    reentry_closes: false,
                    duration_seconds: 600,
                    is_break: false,
                    break_duration_seconds: null,
                  },
                  {
                    id: "level-2",
                    level_order: 2,
                    small_blind: 200,
                    big_blind: 400,
                    ante: 0,
                    reentry_closes: false,
                    duration_seconds: 600,
                    is_break: false,
                    break_duration_seconds: null,
                  },
                ],
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    timerUpdate,
  };
}

describe("TMA timer action route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.afterResponse.splice(0);
    mocks.loadCurrentTournamentContext.mockResolvedValue(null);
  });

  it("resets to the first blind level when starting after a finished tournament", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });

    const { POST } = await import("@/app/api/tma/timer/[action]/route");
    const response = await POST(
      new Request("http://localhost/api/tma/timer/start", { method: "POST" }),
      { params: Promise.resolve({ action: "start" }) },
    );

    expect(response.status).toBe(200);
    expect(supabase.timerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        current_level_index: 0,
        status: "running",
      }),
    );
  });

  it("resets to the first blind level when finishing from TMA", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });

    const { POST } = await import("@/app/api/tma/timer/[action]/route");
    const response = await POST(
      new Request("http://localhost/api/tma/timer/finish", { method: "POST" }),
      { params: Promise.resolve({ action: "finish" }) },
    );

    expect(response.status).toBe(200);
    expect(supabase.timerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        current_level_index: 0,
        status: "finished",
      }),
    );
  });

  // The roster is wiped at the finish, and the players who settle up afterwards are
  // found in the copy the desk is left. A finish from TMA used to leave it empty.
  it("leaves the desk a copy of the room when finishing from TMA", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    const room = [{ id: "player-1", name: "Игрок", status: "active" }];
    const context = { extras: { players: room } };
    mocks.loadCurrentTournamentContext.mockResolvedValue(context);

    const { POST } = await import("@/app/api/tma/timer/[action]/route");
    await POST(
      new Request("http://localhost/api/tma/timer/finish", { method: "POST" }),
      { params: Promise.resolve({ action: "finish" }) },
    );

    expect(mocks.saveTournamentExtrasFromContext).toHaveBeenCalledWith(
      supabase,
      context,
      expect.objectContaining({
        players: [],
        settling: expect.objectContaining({ players: room }),
      }),
    );
  });

  it("grants the winner a pass when a running tournament is finished", async () => {
    const supabase = createSupabaseMock("running");
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    const room = [{ id: "player-1", name: "Игрок", status: "active", finishPlace: 1 }];
    mocks.loadCurrentTournamentContext.mockResolvedValue({ extras: { players: room } });

    const { POST } = await import("@/app/api/tma/timer/[action]/route");
    await POST(
      new Request("http://localhost/api/tma/timer/finish", { method: "POST" }),
      { params: Promise.resolve({ action: "finish" }) },
    );
    await Promise.all(mocks.afterResponse.splice(0).map((task) => task()));

    expect(mocks.grantWinnerPass).toHaveBeenCalledWith(supabase, room);
  });

  it("does not pay the pass again when the tournament was already finished", async () => {
    const supabase = createSupabaseMock("finished");
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    mocks.loadCurrentTournamentContext.mockResolvedValue({
      extras: { players: [{ id: "player-1", name: "Игрок", finishPlace: 1 }] },
    });

    const { POST } = await import("@/app/api/tma/timer/[action]/route");
    await POST(
      new Request("http://localhost/api/tma/timer/finish", { method: "POST" }),
      { params: Promise.resolve({ action: "finish" }) },
    );

    expect(mocks.afterResponse).toHaveLength(0);
    expect(mocks.grantWinnerPass).not.toHaveBeenCalled();
  });
});

describe("breaking a table up from the merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.afterResponse.splice(0);
  });

  function seated(table: number, count: number, firstSeat = 1) {
    return Array.from({ length: count }, (_, index) => ({
      id: `t${table}-${index + 1}`,
      name: `Стол ${table} игрок ${index + 1}`,
      seat: firstSeat + index,
      status: "active",
      table,
    }));
  }

  async function tonight(players: unknown[], settings: Record<string, unknown> = {}) {
    const { mergeTournamentExtras } = await import("@/lib/tournament-extras-shared");
    const context = {
      extras: mergeTournamentExtras({
        players,
        settings: { maxPlayersPerTable: 9, tablesCount: 3, ...settings },
      }),
      tournament: { id: "tournament-1", public_token: "public-token" },
    };
    mocks.loadCurrentTournamentContext.mockResolvedValue(context);
    return context;
  }

  async function callMerge(body?: unknown) {
    const { POST } = await import("@/app/api/tma/timer/[action]/route");
    return POST(
      new Request("http://localhost/api/tma/timer/table-merge", {
        body: body === undefined ? undefined : JSON.stringify(body),
        method: "POST",
      }),
      { params: Promise.resolve({ action: "table-merge" }) },
    );
  }

  it("sends everybody at the table to the others and stops the clock", async () => {
    const supabase = createSupabaseMock("running");
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    await tonight([...seated(1, 3), ...seated(2, 3), ...seated(3, 4)]);

    const response = await callMerge({ table: 3 });

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "break_tournament_table",
      expect.objectContaining({
        p_table: 3,
        p_table_merge: expect.objectContaining({ brokenTable: 3 }),
        p_tournament_id: "tournament-1",
      }),
    );

    const [, args] = supabase.rpc.mock.calls[0] as unknown as [
      string,
      { p_moves: Array<{ id: string; table: number }>; p_table_merge: { moves: unknown[] } },
    ];
    expect(args.p_moves.map((move) => move.id).sort()).toEqual(["t3-1", "t3-2", "t3-3", "t3-4"]);
    expect(args.p_moves.every((move) => move.table === 1 || move.table === 2)).toBe(true);
    expect(args.p_table_merge.moves).toHaveLength(4);

    expect(supabase.timerUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "paused" }));
    // The announcement went up with the moves; a second, bare one would wipe the list.
    expect(mocks.saveTournamentExtrasFromContext).not.toHaveBeenCalled();
  });

  it("refuses a table the others have no room for, and leaves the clock alone", async () => {
    const supabase = createSupabaseMock("running");
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    await tonight([...seated(1, 9), ...seated(2, 3)], { tablesCount: 2 });

    const response = await callMerge({ table: 2 });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Не хватает мест: за столом 1 свободных мест нет, а за столом 2 играют 3 игрока. " +
        "Добавьте места (+ место) на экране «Игроки» и попробуйте ещё раз.",
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.timerUpdate).not.toHaveBeenCalled();
  });

  it("keeps the plain pause for a desk that names no table", async () => {
    const supabase = createSupabaseMock("running");
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    await tonight([...seated(1, 3), ...seated(2, 3)]);

    const response = await callMerge();

    expect(response.status).toBe(200);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.timerUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "paused" }));
    expect(mocks.saveTournamentExtrasFromContext).toHaveBeenCalledWith(
      supabase,
      expect.anything(),
      { tableMerge: { startedAt: expect.any(String) } },
    );
  });

  it("asks again when the room changed while the plan was drawn", async () => {
    const supabase = createSupabaseMock("running");
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Seat already taken by Vera" },
    } as never);
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    await tonight([...seated(1, 3), ...seated(2, 3), ...seated(3, 2)]);

    const response = await callMerge({ table: 3 });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Место уже занято: Vera");
    expect(supabase.timerUpdate).not.toHaveBeenCalled();
  });

  it("names the migration when the database cannot break tables yet", async () => {
    const supabase = createSupabaseMock("running");
    supabase.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.break_tournament_table in the schema cache",
      },
    } as never);
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });
    await tonight([...seated(1, 3), ...seated(2, 3), ...seated(3, 2)]);

    const response = await callMerge({ table: 3 });

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("202609270002");
    expect(supabase.timerUpdate).not.toHaveBeenCalled();
  });

  it("refuses a table that is not one", async () => {
    const supabase = createSupabaseMock("running");
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 42 });

    const response = await callMerge({ table: "третий" });

    expect(response.status).toBe(400);
    expect(supabase.timerUpdate).not.toHaveBeenCalled();
  });
});
