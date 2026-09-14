import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapSeasonRow } from "@/lib/seasons/season";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  listSeasons: vi.fn(),
  writeSeasonSnapshot: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// redirect() never returns: Next throws to leave the action, and so does this stand-in.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/seasons/store", () => ({
  listSeasons: mocks.listSeasons,
  writeSeasonSnapshot: mocks.writeSeasonSnapshot,
}));

import { attachGamesByDate, closeSeason, openSeason } from "@/app/admin/seasons/actions";

const AUTUMN_ID = "0d9c5b8e-6a3f-4f1e-9b2a-7c4d8e1f2a3b";
const APC_ID = "7e2f1a4c-9d3b-4c6a-8e5f-2b1d0c9a8f7e";

const autumnRow = {
  counted_games: null,
  ends_on: null,
  id: AUTUMN_ID,
  parallel: false,
  starts_on: "2026-09-01",
  status: "open",
  title: "Autumn Series",
};

const apcRow = {
  counted_games: null,
  ends_on: "2026-10-06",
  id: APC_ID,
  parallel: true,
  starts_on: "2026-09-15",
  status: "open",
  title: "Отбор на кубок APC",
};

const OPEN_APC_FORM = {
  endsOn: "2026-10-06",
  parallel: "yes",
  startsOn: "2026-09-15",
  title: "Отбор на кубок APC",
};

/** The database as the actions see it: what they insert, what they update, what they touch. */
function databaseSpy({
  insertError = null,
  stored = null,
}: {
  insertError?: { message: string } | null;
  stored?: Record<string, unknown> | null;
} = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<{ id: unknown; patch: Record<string, unknown> }> = [];
  const tables: string[] = [];

  mocks.createSupabaseServerClient.mockResolvedValue({
    from: (table: string) => {
      tables.push(table);

      return {
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: insertError };
        },
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: stored }) }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_column: string, id: unknown) => {
            updated.push({ id, patch });
            return { error: null };
          },
        }),
      };
    },
  });

  return { inserted, tables, updated };
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeSeasonSnapshot.mockResolvedValue({ rows: 0, skipped: true });
});

describe("opening a season", () => {
  it("opens the APC qualifier beside the regular season without closing it", async () => {
    const { inserted, updated } = databaseSpy();
    mocks.listSeasons.mockResolvedValue([mapSeasonRow(autumnRow)]);

    await expect(openSeason(form(OPEN_APC_FORM))).rejects.toThrow(
      "redirect:/admin/seasons?opened=1",
    );

    expect(updated).toEqual([]);
    expect(mocks.writeSeasonSnapshot).not.toHaveBeenCalled();
    expect(inserted).toEqual([
      expect.objectContaining({
        ends_on: "2026-10-06",
        parallel: true,
        starts_on: "2026-09-15",
        status: "open",
        title: "Отбор на кубок APC",
      }),
    ]);
  });

  it("closes only the regular season when the next regular one opens", async () => {
    const { inserted, updated } = databaseSpy();
    mocks.listSeasons.mockResolvedValue([mapSeasonRow(apcRow), mapSeasonRow(autumnRow)]);

    await expect(
      openSeason(form({ startsOn: "2026-12-01", title: "Winter Series" })),
    ).rejects.toThrow("redirect:/admin/seasons?opened=1");

    expect(updated).toEqual([
      { id: AUTUMN_ID, patch: expect.objectContaining({ ends_on: "2026-12-01", status: "closed" }) },
    ]);
    expect(mocks.writeSeasonSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.writeSeasonSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: AUTUMN_ID }),
    );
    expect(inserted[0]).not.toHaveProperty("parallel");
  });

  it("refuses a parallel season that ends before it starts", async () => {
    const { inserted } = databaseSpy();

    await expect(
      openSeason(form({ ...OPEN_APC_FORM, endsOn: "2026-09-01" })),
    ).rejects.toThrow(/^redirect:\/admin\/seasons\?error=/);

    expect(inserted).toEqual([]);
  });

  // Code reaches production on push; the migration is applied by hand afterwards.
  it("asks for the migration when the database cannot hold a parallel season yet", async () => {
    databaseSpy({
      insertError: { message: "Could not find the 'parallel' column of 'seasons' in the schema cache" },
    });

    const refusal = await openSeason(form(OPEN_APC_FORM)).catch((error: Error) => error);

    expect(decodeURIComponent(String(refusal?.message))).toContain(
      "202609140001_parallel_seasons.sql",
    );
  });
});

describe("closing a season", () => {
  it("keeps the APC qualifier's own last day when it is closed the morning after", async () => {
    const { updated } = databaseSpy({ stored: apcRow });

    await expect(closeSeason(form({ endsOn: "2026-10-07", id: APC_ID }))).rejects.toThrow(
      "redirect:/admin/seasons?closed=1",
    );

    expect(updated).toEqual([
      { id: APC_ID, patch: expect.objectContaining({ ends_on: "2026-10-06", status: "closed" }) },
    ]);
  });

  it("ends a regular season on the day it is closed", async () => {
    const { updated } = databaseSpy({ stored: autumnRow });

    await expect(closeSeason(form({ endsOn: "2026-11-30", id: AUTUMN_ID }))).rejects.toThrow(
      "redirect:/admin/seasons?closed=1",
    );

    expect(updated).toEqual([
      { id: AUTUMN_ID, patch: expect.objectContaining({ ends_on: "2026-11-30", status: "closed" }) },
    ]);
  });
});

describe("attaching games by date", () => {
  it("never stamps the APC qualifier on games", async () => {
    const { tables } = databaseSpy({ stored: apcRow });

    await expect(attachGamesByDate(form({ id: APC_ID }))).rejects.toThrow(
      /^redirect:\/admin\/seasons$/,
    );

    expect(tables).not.toContain("tournament_results");
  });
});
