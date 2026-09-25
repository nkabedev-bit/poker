import { describe, expect, it, vi } from "vitest";
import { readAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase/read-all-pages";

/** A table of `size` rows that hands out the slice each page asks for, as Supabase does. */
function table(size: number) {
  const rows = Array.from({ length: size }, (_, index) => ({ id: index }));
  const readPage = vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));

  return { readPage, rows };
}

describe("readAllPages", () => {
  it("reads a table past a thousand rows to its last row", async () => {
    const { readPage, rows } = table(2500);

    expect(await readAllPages(readPage)).toEqual(rows);
    expect(readPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  // A page that comes back exactly full may have more behind it.
  it("asks once more after a page that came back exactly full", async () => {
    const { readPage } = table(SUPABASE_PAGE_SIZE);

    expect(await readAllPages(readPage)).toHaveLength(SUPABASE_PAGE_SIZE);
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it("stops at what a screen asked for", async () => {
    const { readPage } = table(2500);

    const rows = await readAllPages(readPage, { maxRows: 1500 });

    expect(rows).toHaveLength(1500);
    expect(readPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1499],
    ]);
  });

  it("fails loudly rather than handing back part of the table", async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: SUPABASE_PAGE_SIZE }, () => ({})), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("statement timeout") });

    await expect(readAllPages(readPage)).rejects.toThrow("statement timeout");
  });
});
