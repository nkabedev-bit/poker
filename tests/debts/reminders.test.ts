import { describe, expect, it, vi } from "vitest";
import { announceEndedAllowances, sendDebtReminders } from "@/lib/debts/reminders";
import { fakeSupabase } from "./fake-supabase";

const NOW = new Date("2026-10-10T15:00:00.000Z");

function debt(debtorKey: string, extra: Record<string, unknown> = {}) {
  return {
    account_id: debtorKey,
    amount: 2500,
    blocks_from: "2026-10-09T09:00:00.000Z",
    debtor_key: debtorKey,
    game_started_at: "2026-10-08T16:00:00.000Z",
    id: `debt-${debtorKey}`,
    player_name: debtorKey,
    remind: true,
    source: "app",
    ...extra,
  };
}

describe("sendDebtReminders", () => {
  it("writes to whoever owes, and to nobody the club said to leave alone", async () => {
    const db = fakeSupabase({
      client_bot_users: [
        { debt_allowed_until: null, id: "owes" },
        { debt_allowed_until: "2026-10-12T00:00:00.000Z", id: "allowed" },
        { debt_allowed_until: null, id: "from-sheet" },
        { debt_allowed_until: null, id: "last-night" },
      ],
      debt_payments: [],
      player_debts: [
        debt("owes"),
        debt("allowed"),
        // Carried over from the finance sheet: may hold its mistakes, never reminded.
        debt("from-sheet", { remind: false, source: "import" }),
        // Last night's game: the player still has until noon tomorrow.
        debt("last-night", { blocks_from: "2026-10-11T09:00:00.000Z" }),
        // A guest has no account to write to.
        debt("name:guest", { account_id: null }),
      ],
    });
    const writeToPlayer = vi.fn(async () => true);

    const outcome = await sendDebtReminders(db.client, writeToPlayer, NOW);

    expect(writeToPlayer).toHaveBeenCalledTimes(1);
    expect(writeToPlayer).toHaveBeenCalledWith("owes", expect.stringContaining("Напоминаем: за игру 08.10"));
    expect(outcome).toEqual({ reminded: 1, skipped: 1 });
  });

  it("stops once the debt is paid", async () => {
    const db = fakeSupabase({
      client_bot_users: [{ debt_allowed_until: null, id: "owes" }],
      debt_payments: [
        { amount: 2500, cancelled_at: null, created_at: "2026-10-09T10:00:00.000Z", debtor_key: "owes", id: "p1", kind: "payment" },
      ],
      player_debts: [debt("owes")],
    });
    const writeToPlayer = vi.fn(async () => true);

    await sendDebtReminders(db.client, writeToPlayer, NOW);

    expect(writeToPlayer).not.toHaveBeenCalled();
  });
});

describe("announceEndedAllowances", () => {
  it("tells the admin who gave the permission that the player is barred again", async () => {
    const db = fakeSupabase({
      client_bot_users: [
        {
          debt_allowed_by: 384428007,
          debt_allowed_until: "2026-10-10T14:00:00.000Z",
          display_name: "Secret",
          id: "owes",
        },
      ],
      debt_payments: [],
      player_debts: [debt("owes")],
    });
    const writeToAdmin = vi.fn(async () => undefined);

    expect(await announceEndedAllowances(db.client, writeToAdmin, NOW)).toEqual({ announced: 1 });
    expect(writeToAdmin).toHaveBeenCalledWith(
      384428007,
      "Разрешение /allowdebt для «Secret» закончилось. Долг 2 500 ₽ — теперь игрок не может записываться на игры.",
    );
    expect(db.tables.client_bot_users[0]).toMatchObject({ debt_allowed_by: null, debt_allowed_until: null });

    // Said once: the next run finds nothing.
    expect(await announceEndedAllowances(db.client, writeToAdmin, NOW)).toEqual({ announced: 0 });
  });

  it("says nothing about a player who paid in the meantime", async () => {
    const db = fakeSupabase({
      client_bot_users: [
        { debt_allowed_by: 1, debt_allowed_until: "2026-10-10T14:00:00.000Z", display_name: "Paid", id: "paid" },
      ],
      debt_payments: [],
      player_debts: [],
    });
    const writeToAdmin = vi.fn(async () => undefined);

    await announceEndedAllowances(db.client, writeToAdmin, NOW);

    expect(writeToAdmin).not.toHaveBeenCalled();
    expect(db.tables.client_bot_users[0].debt_allowed_by).toBeNull();
  });

  it("leaves a permission that has not run out yet", async () => {
    const db = fakeSupabase({
      client_bot_users: [
        { debt_allowed_by: 1, debt_allowed_until: "2026-10-12T00:00:00.000Z", display_name: "Later", id: "later" },
      ],
      player_debts: [debt("later")],
    });
    const writeToAdmin = vi.fn(async () => undefined);

    await announceEndedAllowances(db.client, writeToAdmin, NOW);

    expect(writeToAdmin).not.toHaveBeenCalled();
    expect(db.tables.client_bot_users[0].debt_allowed_by).toBe(1);
  });
});
