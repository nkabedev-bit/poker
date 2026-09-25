/**
 * How many rows Supabase hands out for one request. Its Data API caps every answer at a
 * thousand rows — the project's "max rows" — and says nothing about the rest, and a
 * `.limit()` above that is quietly held to it too.
 */
export const SUPABASE_PAGE_SIZE = 1000;

type PageAnswer = { data: unknown; error: unknown };

/**
 * Every row a query matches, read a thousand at a time.
 *
 * One request is silently cut at a thousand rows, and the club's tables have grown past
 * that: a season's games, a regular's opponents, the bot's subscribers. The caller builds
 * the query for one page — ordered by something unique, with `id` last, or a row can
 * slip between two pages — and this keeps asking until a page comes back short.
 *
 * `maxRows` stops early for a screen that only ever shows so much.
 */
export async function readAllPages<Row>(
  readPage: (from: number, to: number) => PromiseLike<PageAnswer>,
  { maxRows = Number.POSITIVE_INFINITY }: { maxRows?: number } = {},
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let from = 0; from < maxRows; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE, maxRows) - 1;
    const { data, error } = await readPage(from, to);
    if (error) throw error;

    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }

  return rows;
}
