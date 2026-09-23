import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { mapSeasonRow } from "@/lib/seasons/season";
import { computeSeasonStandings, getOpenRegularSeason } from "@/lib/seasons/store";

type Filter = [operator: string, column: string, value: unknown];
type Rows = Array<Record<string, unknown>>;

type Answer = { data: Rows | null; error: unknown };

type QuerySpy = {
  eq(column: string, value: unknown): QuerySpy;
  gte(column: string, value: unknown): QuerySpy;
  in(column: string, values: unknown[]): QuerySpy;
  lte(column: string, value: unknown): QuerySpy;
  order(column: string): QuerySpy;
  select(columns: string): QuerySpy;
  then<T>(resolve: (result: Answer) => T): Promise<T>;
};

/** A table that answers with what it is given and tells `record` how it was asked. */
function tableSpy(answer: Answer, record: (step: Filter) => void) {
  const query: QuerySpy = {
    eq(column, value) {
      record(["eq", column, value]);
      return query;
    },
    gte(column, value) {
      record(["gte", column, value]);
      return query;
    },
    in(column, values) {
      record(["in", column, values]);
      return query;
    },
    lte(column, value) {
      record(["lte", column, value]);
      return query;
    },
    order(column) {
      record(["order", column, undefined]);
      return query;
    },
    select() {
      return query;
    },
    then(resolve) {
      return Promise.resolve(answer).then(resolve);
    },
  };

  return query;
}

/**
 * The games table answers with `rows` and remembers how it was filtered; the accounts
 * table answers with `accounts`, for the nicknames the lines are named by.
 */
function supabaseSpy(
  rows: Rows,
  { accounts = [], accountsError = null }: { accounts?: Rows; accountsError?: unknown } = {},
) {
  const filters: Filter[] = [];
  const orderedBy: string[] = [];
  const accountLookups: unknown[] = [];

  const games = tableSpy({ data: rows, error: null }, ([operator, column, value]) => {
    if (operator === "order") orderedBy.push(column);
    else filters.push([operator, column, value]);
  });
  const accountsTable = tableSpy(
    accountsError ? { data: null, error: accountsError } : { data: accounts, error: null },
    ([operator, , value]) => {
      if (operator === "in") accountLookups.push(value);
    },
  );

  return {
    accountLookups,
    filters,
    orderedBy,
    supabase: {
      from: (table: string) => (table === "client_bot_users" ? accountsTable : games),
    } as unknown as SupabaseClient,
  };
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

describe("computeSeasonStandings — naming the lines", () => {
  // A line falls back to its latest game's nickname, so "latest" has to mean something.
  it("asks for the games oldest first", async () => {
    const { orderedBy, supabase } = supabaseSpy([]);

    await computeSeasonStandings(supabase, apc);

    expect(orderedBy).toEqual(["started_at"]);
  });

  // 15.09.2026: two accounts were swapped for one evening, and the table put the other
  // player's nickname on 1$'s line.
  it("names each line after the nickname its account goes by now", async () => {
    const { accountLookups, supabase } = supabaseSpy(
      [
        { knockouts: 2, player_name: "1$", points: 250, telegram_id: 887638103 },
        { knockouts: 0, player_name: "Mers cls 055", points: 90, telegram_id: 887638103 },
      ],
      { accounts: [{ display_name: "1$", telegram_id: 887638103 }] },
    );

    const standings = await computeSeasonStandings(supabase, apc);

    expect(accountLookups).toEqual([[887638103]]);
    expect(standings).toEqual([
      { games: 2, knockouts: 2, place: 1, playerName: "1$", points: 340, telegramId: 887638103 },
    ]);
  });

  it("keeps a guest without an account under the name they played under", async () => {
    const { accountLookups, supabase } = supabaseSpy([
      { knockouts: 0, player_name: "Гость Вася", points: 40, telegram_id: null },
    ]);

    const standings = await computeSeasonStandings(supabase, apc);

    expect(accountLookups).toEqual([]);
    expect(standings[0]).toMatchObject({ playerName: "Гость Вася", telegramId: null });
  });

  // The names are a courtesy; the table itself must still stand.
  it("falls back to the latest game's nickname when the accounts cannot be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { supabase } = supabaseSpy(
      [
        { knockouts: 0, player_name: "Старый ник", points: 50, telegram_id: 7 },
        { knockouts: 0, player_name: "kabedev", points: 30, telegram_id: 7 },
      ],
      { accountsError: { message: "permission denied" } },
    );

    const standings = await computeSeasonStandings(supabase, apc);

    expect(standings[0]).toMatchObject({ playerName: "kabedev", points: 80 });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
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
