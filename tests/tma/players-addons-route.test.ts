import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TournamentPlayer } from "@/lib/timer/types";

const mocks = vi.hoisted(() => ({
  loadTournamentExtras: vi.fn(),
  requireTmaAuth: vi.fn(),
  syncTournamentToSheets: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));
vi.mock("@/lib/google-sheets", () => ({ syncTournamentToSheets: mocks.syncTournamentToSheets }));
vi.mock("@/lib/tournament-extras", () => ({ loadTournamentExtras: mocks.loadTournamentExtras }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
  after: (fn: () => void) => {
    fn();
  },
}));

function player(id: string, name: string, overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    id,
    name,
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    rebuys: 0,
    seat: null,
    stack: 20000,
    status: "active",
    table: 1,
    ...overrides,
  };
}

type AddonRpcArgs = { p_chips: number; p_player_id: string; p_tournament_id: string };

function createSupabaseMock(options: { failFor?: string[] } = {}) {
  const rpcCalls: AddonRpcArgs[] = [];

  return {
    rpcCalls,
    client: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: "tournament-1" }, error: null })),
          })),
        })),
      })),
      rpc: vi.fn(async (_name: string, args: AddonRpcArgs) => {
        rpcCalls.push(args);
        if (options.failFor?.includes(args.p_player_id)) {
          return { data: null, error: null };
        }
        return { data: player(args.p_player_id, `Игрок ${args.p_player_id}`, { addons: 1 }), error: null };
      }),
    },
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/tma/players/addons", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function loadRoute() {
  return import("@/app/api/tma/players/addons/route");
}

describe("POST /api/tma/players/addons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a fixed addon to every selected player and syncs the sheet once", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase: supabase.client, userId: 1 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("p1", "Иван"), player("p2", "Пётр"), player("p3", "Вася")],
        settings: { addonEnabled: true, maxAddons: 1 },
      }),
    );

    const { BULK_ADDON_CHIPS, POST } = await loadRoute();
    const response = await POST(request({ playerIds: ["p1", "p2", "p3"] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.applied).toHaveLength(3);
    expect(body.failed).toEqual([]);
    expect(supabase.rpcCalls.map((call) => call.p_player_id)).toEqual(["p1", "p2", "p3"]);
    expect(supabase.rpcCalls.every((call) => call.p_chips === BULK_ADDON_CHIPS)).toBe(true);
    expect(mocks.syncTournamentToSheets).toHaveBeenCalledTimes(1);
  });

  it("applies the addon to the rest and reports players it had to skip", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase: supabase.client, userId: 1 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          player("p1", "Иван"),
          player("p2", "Пётр", { addons: 1 }),
          player("p3", "Вася", { status: "eliminated" }),
        ],
        settings: { addonEnabled: true, maxAddons: 1 },
      }),
    );

    const { POST } = await loadRoute();
    const response = await POST(request({ playerIds: ["p1", "p2", "p3", "ghost"] }));
    const body = await response.json();

    expect(body.applied).toEqual([{ id: "p1", name: "Игрок p1" }]);
    expect(body.failed).toEqual([
      { id: "p2", name: "Пётр", reason: "limit" },
      { id: "p3", name: "Вася", reason: "eliminated" },
      { id: "ghost", name: "", reason: "not_found" },
    ]);
    expect(supabase.rpcCalls).toHaveLength(1);
  });

  it("reports a limit reached by the database as a failure, not a success", async () => {
    const supabase = createSupabaseMock({ failFor: ["p2"] });
    mocks.requireTmaAuth.mockResolvedValue({ supabase: supabase.client, userId: 1 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [player("p1", "Иван"), player("p2", "Пётр")],
        settings: { addonEnabled: true, maxAddons: 2 },
      }),
    );

    const { POST } = await loadRoute();
    const body = await (await POST(request({ playerIds: ["p1", "p2"] }))).json();

    expect(body.applied).toHaveLength(1);
    expect(body.failed).toEqual([{ id: "p2", name: "Пётр", reason: "limit" }]);
  });

  it("refuses the batch when addons are disabled in the settings", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase: supabase.client, userId: 1 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({ players: [player("p1", "Иван")], settings: { addonEnabled: false } }),
    );

    const { POST } = await loadRoute();
    const response = await POST(request({ playerIds: ["p1"] }));

    expect(response.status).toBe(400);
    expect(supabase.rpcCalls).toHaveLength(0);
    expect(mocks.syncTournamentToSheets).not.toHaveBeenCalled();
  });

  it("rejects an empty selection", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase: supabase.client, userId: 1 });
    mocks.loadTournamentExtras.mockResolvedValue(mergeTournamentExtras({}));

    const { POST } = await loadRoute();
    const response = await POST(request({ playerIds: [] }));

    expect(response.status).toBe(400);
  });
});
