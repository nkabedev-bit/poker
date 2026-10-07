import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/**
 * In-memory tables behind the small part of the Supabase query builder the debt code
 * uses: filters, paging, insert / upsert / update / delete, and reading back.
 */
export function fakeSupabase(tables: Record<string, Row[]>) {
  let nextId = 1;

  function from(table: string) {
    const rows = () => (tables[table] ??= []);
    const filters: Filter[] = [];
    let op: "delete" | "insert" | "select" | "update" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let conflict: string[] = [];
    let range: [number, number] | null = null;

    const run = () => {
      const matched = rows().filter((row) => filters.every((filter) => filter(row)));

      if (op === "update") {
        matched.forEach((row) => Object.assign(row, payload));
        return { data: matched, error: null };
      }
      if (op === "delete") {
        tables[table] = rows().filter((row) => !matched.includes(row));
        return { data: matched, error: null };
      }
      if (op === "insert" || op === "upsert") {
        const incoming = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const written = incoming.map((item) => {
          const existing =
            op === "upsert"
              ? rows().find((row) => conflict.every((column) => row[column] === item[column]))
              : undefined;
          if (existing) return Object.assign(existing, item);

          const row = {
            cancelled_at: null,
            created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, nextId)).toISOString(),
            id: `row-${nextId++}`,
            ...item,
          };
          rows().push(row);
          return row;
        });
        return { data: written, error: null };
      }

      // Copies, as a real answer is: changing what was read does not change the table.
      const page = range ? matched.slice(range[0], range[1] + 1) : matched;
      return { data: page.map((row) => ({ ...row })), error: null };
    };

    const first = () => {
      const { data } = run();
      return { data: data[0] ?? null, error: null };
    };

    const builder = {
      delete: () => ((op = "delete"), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      insert: (value: Row | Row[]) => ((op = "insert"), (payload = value), builder),
      is: (column: string, value: unknown) => (filters.push((row) => (row[column] ?? null) === value), builder),
      limit: () => builder,
      lte: (column: string, value: string) =>
        (filters.push((row) => row[column] != null && String(row[column]) <= value), builder),
      maybeSingle: async () => first(),
      not: (column: string, _operator: "is", value: unknown) =>
        (filters.push((row) => (row[column] ?? null) !== value), builder),
      order: () => builder,
      range: (start: number, end: number) => ((range = [start, end]), builder),
      select: () => builder,
      single: async () => first(),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
      update: (value: Row) => ((op = "update"), (payload = value), builder),
      upsert: (value: Row[], options?: { onConflict?: string }) => {
        op = "upsert";
        payload = value;
        conflict = (options?.onConflict ?? "id").split(",");
        return builder;
      },
    };

    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, tables };
}
