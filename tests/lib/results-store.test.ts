import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TournamentPlayer } from "@/lib/timer/types";

vi.mock("@/lib/seasons/store", () => ({ getOpenRegularSeason: async () => null }));

const { saveTournamentResults } = await import("@/lib/results/store");

function player(overrides: Partial<TournamentPlayer>): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id: crypto.randomUUID(),
    name: "Игрок",
    rebuys: 0,
    seat: 1,
    stack: 0,
    status: "eliminated",
    table: 1,
    ...overrides,
  };
}

/**
 * The club's database, missing whichever late columns a test names. Every upsert is
 * recorded, the ones it refused as well.
 */
function database(missing: string[]) {
  const upserts: Array<Array<Record<string, unknown>>> = [];

  const chain = () => {
    const query = {
      eq: () => query,
      gte: () => query,
      limit: () => query,
      lt: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
      order: () => query,
      select: () => query,
    };
    return query;
  };

  const from = (table: string) => {
    if (table !== "tournament_results") return chain();

    return {
      upsert: async (rows: Array<Record<string, unknown>>) => {
        upserts.push(rows);
        const absent = missing.find((column) => column in (rows[0] ?? {}));
        return absent
          ? { error: { message: `Could not find the '${absent}' column of 'tournament_results'` } }
          : { error: null };
      },
    };
  };

  return { supabase: { from } as never, upserts };
}

async function finish(missing: string[], { maxPlayersPerTable = 9 } = {}) {
  const { supabase, upserts } = database(missing);
  const extras = mergeTournamentExtras({
    settings: { maxPlayersPerTable, sheetsSessionStartedAt: "2026-09-27T15:00:00.000Z" },
  });
  await saveTournamentResults({
    extras,
    players: [player({ finishPlace: 1, name: "Chura", rebuys: 1 }), player({ finishPlace: 2, name: "Vera" })],
    supabase,
    tournamentId: "tournament-1",
  });
  return upserts;
}

describe("saveTournamentResults — columns the club has not added yet", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("writes how early each player sat down where the column is there", async () => {
    const upserts = await finish([]);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.map((row) => [row.player_name, row.seat_order, row.rebuys])).toEqual([
      ["Chura", 1, 1],
      ["Vera", 2, 0],
    ]);
  });

  it("writes the final table as big as the tables were set that evening", async () => {
    const nineMax = await finish([], { maxPlayersPerTable: 9 });
    const tenMax = await finish([], { maxPlayersPerTable: 10 });

    expect(nineMax[0]?.map((row) => row.final_table_size)).toEqual([9, 9]);
    expect(tenMax[0]?.map((row) => row.final_table_size)).toEqual([10, 10]);
  });

  it("leaves out only the final table size when that is what is missing", async () => {
    const upserts = await finish(["final_table_size"]);
    const stored = upserts.at(-1)?.[0] ?? {};

    expect(upserts).toHaveLength(2);
    expect(stored).not.toHaveProperty("final_table_size");
    expect(stored).toMatchObject({ rebuys: 1, seat_order: 1 });
  });

  // The newest migration missing must not cost the game its medal and its re-entries.
  it("leaves out only the seating order when that is what is missing", async () => {
    const upserts = await finish(["seat_order"]);
    const stored = upserts.at(-1)?.[0] ?? {};

    expect(upserts).toHaveLength(2);
    expect(stored).not.toHaveProperty("seat_order");
    expect(stored).toHaveProperty("medal_key");
    expect(stored).toMatchObject({ rebuys: 1 });
  });

  it("still stores the game when none of the late columns is there", async () => {
    const late = ["final_table_size", "seat_order", "rebuys", "medal_key"];
    const upserts = await finish(late);
    const stored = upserts.at(-1)?.[0] ?? {};

    expect(stored).toMatchObject({ place: 1, player_name: "Chura" });
    for (const column of late) {
      expect(stored).not.toHaveProperty(column);
    }
  });
});
