import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";

const mocks = vi.hoisted(() => ({
  loadTournamentExtras: vi.fn(),
  requireTmaAuth: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));

vi.mock("@/lib/tournament-extras", () => ({ loadTournamentExtras: mocks.loadTournamentExtras }));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

/** The tournament row, and set_table_format answering the way it is told to. */
function database(answer: { data?: unknown; error?: unknown } = {}) {
  const tournaments = {
    limit: () => tournaments,
    select: () => tournaments,
    single: async () => ({ data: { id: "tournament-1" }, error: null }),
  };
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));

  return { rpc, supabase: { from: () => tournaments, rpc } };
}

/** Three six-handed tables, as the settings have them, with whatever the desk changed. */
function room(tableFormats: Array<number | null> = []) {
  return mergeTournamentExtras({
    players: [],
    settings: { maxPlayersPerTable: 6, tablesCount: 3 },
    tableFormats,
  });
}

async function change(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/tma/tables/route");

  return POST(
    new Request("http://localhost/api/tma/tables", { body: JSON.stringify(body), method: "POST" }),
  );
}

describe("bringing a chair to a table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes a six-handed table to seven", async () => {
    const { rpc, supabase } = database({ data: [null, 7] });
    mocks.requireTmaAuth.mockResolvedValue({ supabase });
    mocks.loadTournamentExtras.mockResolvedValue(room());

    const response = await change({ direction: "add", table: 2 });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_table_format", {
      p_format: 7,
      p_removed_seats: [],
      p_table: 2,
      p_tournament_id: "tournament-1",
    });
    expect(await response.json()).toEqual({ tableFormats: [6, 7, 6] });
  });

  it("names the places a table loses when it goes down", async () => {
    const { rpc, supabase } = database({ data: [9] });
    mocks.requireTmaAuth.mockResolvedValue({ supabase });
    mocks.loadTournamentExtras.mockResolvedValue(room([10]));

    await change({ direction: "remove", table: 1 });

    expect(rpc).toHaveBeenCalledWith(
      "set_table_format",
      expect.objectContaining({ p_format: 9, p_removed_seats: [10] }),
    );
  });

  // A chair is carried away only empty; the desk is told who has to move first.
  it("says who is sitting in a chair it cannot take away", async () => {
    const { supabase } = database({ error: { message: "Seat 5 is taken by Валет" } });
    mocks.requireTmaAuth.mockResolvedValue({ supabase });
    mocks.loadTournamentExtras.mockResolvedValue(room([7]));

    const response = await change({ direction: "remove", table: 1 });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("Место 5 занято: Валет. Сначала пересадите игрока");
  });

  it("refuses an eleventh chair", async () => {
    const { rpc, supabase } = database();
    mocks.requireTmaAuth.mockResolvedValue({ supabase });
    mocks.loadTournamentExtras.mockResolvedValue(room([10]));

    const response = await change({ direction: "add", table: 1 });

    expect(response.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  // Deployed ahead of the migration, the desk is told what is missing.
  it("asks for the migration while the database function is missing", async () => {
    const { supabase } = database({
      error: { code: "PGRST202", message: "Could not find the function public.set_table_format" },
    });
    mocks.requireTmaAuth.mockResolvedValue({ supabase });
    mocks.loadTournamentExtras.mockResolvedValue(room());

    const response = await change({ direction: "add", table: 1 });

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("202609140004");
  });

  it("refuses a table the room does not have", async () => {
    const { rpc, supabase } = database();
    mocks.requireTmaAuth.mockResolvedValue({ supabase });
    mocks.loadTournamentExtras.mockResolvedValue(room());

    const response = await change({ direction: "add", table: 4 });

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
