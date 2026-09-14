import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { mapSeasonRow } from "@/lib/seasons/season";
import { computeSeasonStandings, getOpenRegularSeason } from "@/lib/seasons/store";

type Filter = [operator: string, column: string, value: unknown];
type Rows = Array<Record<string, unknown>>;

type QuerySpy = {
  eq(column: string, value: unknown): QuerySpy;
  gte(column: string, value: unknown): QuerySpy;
  lte(column: string, value: unknown): QuerySpy;
  select(columns: string): QuerySpy;
  then<T>(resolve: (result: { data: Rows; error: null }) => T): Promise<T>;
};

/** One table: answers with the rows it is given and remembers how it was filtered. */
function supabaseSpy(rows: Rows) {
  const filters: Filter[] = [];
  const query: QuerySpy = {
    eq(column, value) {
      filters.push(["eq", column, value]);
      return query;
    },
    gte(column, value) {
      filters.push(["gte", column, value]);
      return query;
    },
    lte(column, value) {
      filters.push(["lte", column, value]);
      return query;
    },
    select() {
      return query;
    },
    then(resolve) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };

  return { filters, supabase: { from: () => query } as unknown as SupabaseClient };
}

const apc = mapSeasonRow({
  counted_games: null,
  ends_on: "2026-10-06",
  id: "apc",
  parallel: true,
  starts_on: "2026-09-15",
  status: "open",
  title: "Отбор на кубок APC",
});

const autumn = mapSeasonRow({
  counted_games: null,
  ends_on: null,
  id: "autumn",
  parallel: false,
  starts_on: "2026-09-01",
  status: "open",
  title: "Autumn Series",
});

describe("computeSeasonStandings", () => {
  // The qualifier's games are stamped with the regular season, so it has to find them by
  // the day they were played.
  it("counts the rating games inside a parallel season's dates", async () => {
    const { filters, supabase } = supabaseSpy([
      { knockouts: 1, player_name: "kabedev", points: 100, telegram_id: 7 },
      { knockouts: 2, player_name: "kabedev", points: 50, telegram_id: 7 },
    ]);

    const standings = await computeSeasonStandings(supabase, apc);

    expect(filters).toEqual([
      ["eq", "counts_for_rating", true],
      ["gte", "played_on", "2026-09-15"],
      ["lte", "played_on", "2026-10-06"],
    ]);
    expect(standings).toEqual([
      { games: 2, knockouts: 3, place: 1, playerName: "kabedev", points: 150, telegramId: 7 },
    ]);
  });

  it("keeps counting a parallel season with no end date from its start onwards", async () => {
    const { filters, supabase } = supabaseSpy([]);

    await computeSeasonStandings(supabase, { ...apc, endsOn: null });

    expect(filters).toEqual([
      ["eq", "counts_for_rating", true],
      ["gte", "played_on", "2026-09-15"],
    ]);
  });

  it("counts a regular season from the games stamped with it", async () => {
    const { filters, supabase } = supabaseSpy([]);

    await computeSeasonStandings(supabase, autumn);

    expect(filters).toEqual([
      ["eq", "counts_for_rating", true],
      ["eq", "season_id", "autumn"],
    ]);
  });
});

describe("getOpenRegularSeason", () => {
  // Two open seasons used to fail this lookup, and the saving of a finished game with it.
  it("gives tonight's game the regular season while the APC qualifier is open beside it", async () => {
    const { supabase } = supabaseSpy([
      { id: "apc", parallel: true, starts_on: "2026-09-15", status: "open", title: "Отбор на кубок APC" },
      { id: "autumn", parallel: false, starts_on: "2026-09-01", status: "open", title: "Autumn Series" },
    ]);

    const season = await getOpenRegularSeason(supabase);

    expect(season?.id).toBe("autumn");
  });

  it("gives the game no season when only a parallel one is open", async () => {
    const { supabase } = supabaseSpy([
      { id: "apc", parallel: true, starts_on: "2026-09-15", status: "open", title: "Отбор на кубок APC" },
    ]);

    const season = await getOpenRegularSeason(supabase);

    expect(season).toBeNull();
  });

  it("finds the open season before the parallel-season migration is applied", async () => {
    const { supabase } = supabaseSpy([
      { id: "autumn", starts_on: "2026-09-01", status: "open", title: "Autumn Series" },
    ]);

    const season = await getOpenRegularSeason(supabase);

    expect(season?.id).toBe("autumn");
  });
});
