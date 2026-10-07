import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachYandexToAccount } from "@/lib/auth/attach-yandex";

type Row = { id: string; profile_submitted_at: string | null; telegram_id: number | null; yandex_id: string | null };

/** Just enough of client_bot_users: select by id / yandex_id, delete and update by id. */
function store(rows: Row[]) {
  const table = rows.map((row) => ({ ...row }));
  const updates: Array<{ id: string; patch: Partial<Row> & { email?: string } }> = [];
  const deleted: string[] = [];

  const client = {
    from: () => ({
      select: () => ({
        eq: (column: keyof Row, value: unknown) => ({
          maybeSingle: async () => ({ data: table.find((row) => row[column] === value) ?? null, error: null }),
        }),
      }),
      delete: () => ({
        eq: async (_column: string, id: string) => {
          deleted.push(id);
          table.splice(table.findIndex((row) => row.id === id), 1);
          return { error: null };
        },
      }),
      update: (patch: Partial<Row> & { email?: string }) => ({
        eq: async (_column: string, id: string) => {
          updates.push({ id, patch });
          Object.assign(table.find((row) => row.id === id) ?? {}, patch);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;

  return { client, deleted, table, updates };
}

const telegramProfile: Row = { id: "tg-profile", profile_submitted_at: "2026-09-01", telegram_id: 42, yandex_id: null };

describe("attachYandexToAccount", () => {
  it("adds the Yandex id to the Telegram profile and keeps its Telegram id", async () => {
    const db = store([telegramProfile]);

    const outcome = await attachYandexToAccount(db.client, { accountId: "tg-profile", email: "p@ya.ru", yandexId: "ya-1" });

    expect(outcome).toEqual({ accountId: "tg-profile", error: null });
    expect(db.table[0]).toMatchObject({ telegram_id: 42, yandex_id: "ya-1" });
    expect(db.updates).toEqual([{ id: "tg-profile", patch: { email: "p@ya.ru", yandex_id: "ya-1" } }]);
  });

  it("drops an empty web account this Yandex id made earlier, then attaches", async () => {
    const db = store([
      telegramProfile,
      { id: "empty-web", profile_submitted_at: null, telegram_id: null, yandex_id: "ya-1" },
    ]);

    const outcome = await attachYandexToAccount(db.client, { accountId: "tg-profile", email: null, yandexId: "ya-1" });

    expect(outcome.error).toBeNull();
    expect(db.deleted).toEqual(["empty-web"]);
    expect(db.table.find((row) => row.id === "tg-profile")?.yandex_id).toBe("ya-1");
  });

  it("does not move a Yandex id that already carries a real club profile", async () => {
    const db = store([
      telegramProfile,
      { id: "web-player", profile_submitted_at: "2026-09-10", telegram_id: null, yandex_id: "ya-1" },
    ]);

    const outcome = await attachYandexToAccount(db.client, { accountId: "tg-profile", email: null, yandexId: "ya-1" });

    expect(outcome).toEqual({ accountId: null, error: "yandex_taken" });
    expect(db.deleted).toEqual([]);
    expect(db.updates).toEqual([]);
  });

  it("leaves a profile alone that another Yandex account already signs into", async () => {
    const db = store([{ ...telegramProfile, yandex_id: "ya-other" }]);

    const outcome = await attachYandexToAccount(db.client, { accountId: "tg-profile", email: null, yandexId: "ya-1" });

    expect(outcome).toEqual({ accountId: null, error: "other_yandex" });
    expect(db.updates).toEqual([]);
  });

  it("lets the same Yandex account in again without changing anything", async () => {
    const db = store([{ ...telegramProfile, yandex_id: "ya-1" }]);

    const outcome = await attachYandexToAccount(db.client, { accountId: "tg-profile", email: null, yandexId: "ya-1" });

    expect(outcome).toEqual({ accountId: "tg-profile", error: null });
    expect(db.updates).toEqual([]);
  });

  it("reports a profile that is gone", async () => {
    const db = store([]);

    expect(await attachYandexToAccount(db.client, { accountId: "nobody", email: null, yandexId: "ya-1" })).toEqual({
      accountId: null,
      error: "account_gone",
    });
  });
});
