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
