import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { buildPlayerStats, readPlayerGames, type PlayedGame } from "@/lib/players/profile";

type Row = Record<string, unknown>;

/**
 * The results table, answering the way Supabase does: filtered by `in`, one page of at
 * most a thousand rows for each `range`. `columns` fails a read that asks for them.
 */
function resultsTable(
  rows: Row[],
  { missingColumn, missingColumns = missingColumn ? [missingColumn] : [] }: {
    missingColumn?: string;
    missingColumns?: string[];
  } = {},
) {
  const pages: Array<[number, number]> = [];
  const batches: unknown[][] = [];

  const from = () => {
    let selected = "";
    let matching = rows;
    const query = {
      in(column: string, values: unknown[]) {
        batches.push(values);
        matching = matching.filter((row) => values.includes(row[column]));
        return query;
      },
      not() {
        return query;
      },
      or() {
        return query;
      },
      order() {
        return query;
      },
      range(start: number, end: number) {
        pages.push([start, end]);
        // Like Postgres, the first column asked for that is not there is the one named.
        const missing = selected
          .split(",")
          .map((column) => column.trim())
          .find((column) => missingColumns.includes(column));
        if (missing) {
          return Promise.resolve({ data: null, error: { message: `column ${missing} does not exist` } });
        }
        return Promise.resolve({ data: matching.slice(start, end + 1), error: null });
      },
      select(columns: string) {
        selected = columns;
        return query;
      },
    };
    return query;
  };

  return { batches, pages, supabase: { from } as unknown as SupabaseClient };
}

function startOf(game: number) {
  return new Date(Date.UTC(2026, 0, 1, 19) + game * 86_400_000).toISOString();
}

describe("readPlayerGames", () => {
  // A regular's history is past any one request: every game counts for the achievements.
  it("reads every game a player has, past a thousand", async () => {
    const games = Array.from({ length: 1200 }, (_, game) => ({
      knockouts: 1,
      place: 5,
      rebuys: 0,
      started_at: startOf(game),
    }));
    const { supabase } = resultsTable(games);

    const played = await readPlayerGames(supabase, { nickname: "Kabedev", telegramId: 7 });

    expect(played).toHaveLength(1200);
  });

  it("still reads the games where the re-entries column has not been added", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase } = resultsTable([{ knockouts: 1, place: 1, started_at: startOf(0) }], {
      missingColumn: "rebuys",
    });

    const played = await readPlayerGames(supabase, { nickname: "Kabedev", telegramId: 7 });

    expect(played).toEqual([
      { knockouts: 1, place: 1, rebuys: null, seatOrder: null, startedAt: startOf(0) },
    ]);
  });

  it("still reads the games where the seating order has not been added", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase } = resultsTable(
      [{ knockouts: 0, place: 3, rebuys: 1, started_at: startOf(0) }],
      { missingColumn: "seat_order" },
    );

    const played = await readPlayerGames(supabase, { nickname: "Kabedev", telegramId: 7 });

    expect(played).toEqual([
      { knockouts: 0, place: 3, rebuys: 1, seatOrder: null, startedAt: startOf(0) },
    ]);
  });

  // Both came with migrations run by hand: an old database may have neither.
  it("still reads the games when neither late column is there", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase } = resultsTable([{ knockouts: 2, place: 5, started_at: startOf(0) }], {
      missingColumns: ["rebuys", "seat_order"],
    });

    const played = await readPlayerGames(supabase, { nickname: "Kabedev", telegramId: 7 });

    expect(played).toEqual([
      { knockouts: 2, place: 5, rebuys: null, seatOrder: null, startedAt: startOf(0) },
    ]);
  });

  it("reads how early the player sat down", async () => {
    const { supabase } = resultsTable([
      { knockouts: 0, place: 2, rebuys: 0, seat_order: 1, started_at: startOf(0) },
    ]);

    const played = await readPlayerGames(supabase, { nickname: "Kabedev", telegramId: 7 });

    expect(played[0]?.seatOrder).toBe(1);
  });
});

describe("buildPlayerStats — last place", () => {
  // 150 evenings of 30 players: 4,500 rows, far past a thousand, over two batches of games.
  it("reads the whole field of every game before calling anyone last", async () => {
    const games = 150;
    const field = 30;
    const rows = Array.from({ length: games * field }, (_, index) => ({
      place: (index % field) + 1,
      started_at: startOf(Math.floor(index / field)),
    }));
    // Last in every game but the first, where they finished 29th of 30.
    const played: PlayedGame[] = Array.from({ length: games }, (_, game) => ({
      knockouts: 0,
      place: game === 0 ? field - 1 : field,
      rebuys: 0,
      startedAt: startOf(game),
    }));
    const { batches, supabase } = resultsTable(rows);

    const stats = await buildPlayerStats(supabase, played);

    expect(stats.lastPlace).toBe(games - 1);
    // A hundred games to a request keeps each query short, and every game is asked about.
    expect(Math.max(...batches.map((batch) => batch.length))).toBe(100);
    expect(new Set(batches.flat()).size).toBe(games);
  });

  it("counts nobody last when the fields cannot be read, rather than guessing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      from: () => {
        const query = {
          in: () => query,
          not: () => query,
          order: () => query,
          range: async () => ({ data: null, error: new Error("timeout") }),
          select: () => query,
        };
        return query;
      },
    } as unknown as SupabaseClient;

    const stats = await buildPlayerStats(failing, [
      { knockouts: 0, place: 30, rebuys: 0, startedAt: startOf(0) },
    ]);

    expect(stats).toMatchObject({ games: 1, lastPlace: 0 });
  });
});
