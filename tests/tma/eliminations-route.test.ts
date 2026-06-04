import { describe, expect, it, vi, beforeEach } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TimerState, TournamentPlayer } from "@/lib/timer/types";

const mocks = vi.hoisted(() => ({
  appendEliminationRow: vi.fn(),
  broadcastPublicState: vi.fn(),
  loadTournamentExtras: vi.fn(),
  requireTmaAuth: vi.fn(),
  saveTournamentExtras: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({
  requireTmaAuth: mocks.requireTmaAuth,
}));

vi.mock("@/lib/google-sheets", () => ({
  appendEliminationRow: mocks.appendEliminationRow,
}));

vi.mock("@/lib/realtime/broadcast", () => ({
  broadcastPublicState: mocks.broadcastPublicState,
}));

vi.mock("@/lib/tournament-extras", () => ({
  loadTournamentExtras: mocks.loadTournamentExtras,
  saveTournamentExtras: mocks.saveTournamentExtras,
}));

const timerStateRow = {
  status: "running",
  current_level_index: 0,
  level_started_at: null,
  paused_remaining_seconds: null,
  registration_closes_at: null,
  finished_at: null,
} satisfies Record<string, TimerState[keyof TimerState]>;

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

function createSupabaseMock() {
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
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        };
      }

      if (table === "bounty_log") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "bounty-1" }, error: null })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    timerUpdate,
  };
}

describe("TMA eliminations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendEliminationRow.mockResolvedValue({ rowId: "row-1", sheetName: "Sheet1" });
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
    expect(mocks.saveTournamentExtras).toHaveBeenCalledWith(
      { players: [] },
      "/tma/eliminations",
    );
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
    expect(mocks.saveTournamentExtras).toHaveBeenCalledWith(
      expect.objectContaining({
        players: expect.arrayContaining([
          expect.objectContaining({ id: "out", status: "eliminated" }),
        ]),
      }),
      "/tma/eliminations",
    );
    expect(mocks.appendEliminationRow).toHaveBeenCalledWith(
      expect.objectContaining({ usesReentry: false }),
    );
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
    expect(mocks.saveTournamentExtras).toHaveBeenCalledWith(
      expect.objectContaining({
        players: expect.arrayContaining([
          expect.objectContaining({ id: "out", status: "eliminated" }),
        ]),
      }),
      "/tma/eliminations",
    );
    expect(mocks.appendEliminationRow).toHaveBeenCalledWith(
      expect.objectContaining({ usesReentry: false }),
    );
  });
});
