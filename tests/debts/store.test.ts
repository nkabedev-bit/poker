import { describe, expect, it, vi } from "vitest";
import {
  cancelDebtPayment,
  readSignupDebt,
  recordDebtPayment,
  recordEveningDebts,
  recordFinishedEveningDebts,
  setEveningDebtPaid,
} from "@/lib/debts/store";
import type { FinancePrices } from "@/lib/finance/player-charge";
import type { TournamentPlayer } from "@/lib/timer/types";
import { fakeSupabase } from "./fake-supabase";

const GAME = "2026-10-08T16:00:00.000Z";

const prices: FinancePrices = {
  addonPrice: 1000,
  buyIn: 1250,
  doubleRebuyPrice: 2000,
  duoBuyIn: 2000,
  rebuyPrice: 1250,
  vipBuyIn: 2000,
};

function seat(extra: Partial<TournamentPlayer>): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id: `seat-${extra.name}`,
    name: "Player",
    rebuys: 0,
    registrationNumber: 1,
    seat: 1,
    stack: 0,
    status: "eliminated",
    table: 1,
    ...extra,
  } as TournamentPlayer;
}

function debtRow(extra: Record<string, unknown> = {}) {
  return {
    account_id: "acc-secret",
    amount: 2500,
    blocks_from: "2026-09-30T09:00:00.000Z",
    debtor_key: "acc-secret",
    game_started_at: "2026-09-29T16:00:00.000Z",
    id: "debt-1",
    player_name: "Secret",
    remind: true,
    source: "app",
    ...extra,
  };
}

describe("recordEveningDebts", () => {
  it("finds the account behind every kind of seat", async () => {
    const db = fakeSupabase({
      client_bot_users: [
        { id: "acc-tg", nickname_key: "telegram", telegram_id: 42 },
        { id: "acc-typed", nickname_key: "typedin", telegram_id: null },
      ],
    });

    await recordEveningDebts({
      gameStartedAt: GAME,
      players: [
        seat({ accountId: "acc-signup", name: "Signed Up" }),
        seat({ name: "Telegram", telegramId: 42 }),
        seat({ name: "Typed In" }),
        seat({ name: "Stranger" }),
      ],
      prices,
      supabase: db.client,
      tournamentId: "t-1",
    });

    expect(db.tables.player_debts.map((row) => [row.player_name, row.debtor_key, row.amount])).toEqual([
      ["Signed Up", "acc-signup", 1250],
      ["Telegram", "acc-tg", 1250],
      ["Typed In", "acc-typed", 1250],
      ["Stranger", "name:stranger", 1250],
    ]);
    expect(db.tables.player_debts[0]).toMatchObject({
      blocks_from: "2026-10-09T09:00:00.000Z",
      remind: true,
      source: "app",
    });
  });

  it("does not double an evening written twice", async () => {
    const db = fakeSupabase({});
    const context = {
      gameStartedAt: GAME,
      players: [seat({ accountId: "acc-1", name: "Owes" })],
      prices,
      supabase: db.client,
      tournamentId: "t-1",
    };

    await recordEveningDebts(context);
    await recordEveningDebts(context);

    expect(db.tables.player_debts).toHaveLength(1);
  });
});

describe("recordFinishedEveningDebts", () => {
  it("never holds up the finish", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = { from: () => ({ upsert: () => Promise.reject(new Error("db down")) }) };

    await expect(
      recordFinishedEveningDebts(
        broken as never,
        {
          players: [seat({ accountId: "acc-1", name: "Owes" })],
          settings: { buyIn: 1250, sheetsSessionStartedAt: GAME } as never,
        },
        "t-1",
      ),
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("setEveningDebtPaid", () => {
  it("drops the evening's debt when the desk ticks the player off after the finish", async () => {
    const db = fakeSupabase({});
    const owes = seat({ accountId: "acc-1", name: "Owes" });
    const context = { gameStartedAt: GAME, prices, supabase: db.client, tournamentId: "t-1" };

    await recordEveningDebts({ ...context, players: [owes] });
    await setEveningDebtPaid({ ...context, paid: true, player: { ...owes, paid: true } });
    expect(db.tables.player_debts).toHaveLength(0);

    await setEveningDebtPaid({ ...context, paid: false, player: owes });
    expect(db.tables.player_debts).toHaveLength(1);
  });
});

describe("recordDebtPayment", () => {
  it("takes part of the debt and keeps the rest", async () => {
    const db = fakeSupabase({ debt_payments: [], player_debts: [debtRow()] });

    const outcome = await recordDebtPayment(db.client, {
      amount: 1000,
      debtorKey: "acc-secret",
      kind: "payment",
      recordedBy: 384428007,
    });

    expect(outcome.error).toBeNull();
    expect(outcome.change?.after[0].left).toBe(1500);
    expect(db.tables.debt_payments[0]).toMatchObject({ amount: 1000, kind: "payment", recorded_by: 384428007 });
  });

  it("refuses more than the player owes", async () => {
    const db = fakeSupabase({ debt_payments: [], player_debts: [debtRow()] });

    const outcome = await recordDebtPayment(db.client, {
      amount: 25000,
      debtorKey: "acc-secret",
      kind: "payment",
      recordedBy: 1,
    });

    expect(outcome).toEqual({ change: null, error: "Сумма больше долга" });
    expect(db.tables.debt_payments).toHaveLength(0);
  });

  it("writes off whatever is left", async () => {
    const db = fakeSupabase({ debt_payments: [], player_debts: [debtRow()] });

    await recordDebtPayment(db.client, { amount: 0, debtorKey: "acc-secret", kind: "writeoff", recordedBy: 1 });

    expect(db.tables.debt_payments[0]).toMatchObject({ amount: 2500, kind: "writeoff" });
  });

  it("brings the debt back when a payment is cancelled", async () => {
    const db = fakeSupabase({ debt_payments: [], player_debts: [debtRow()] });
    await recordDebtPayment(db.client, { amount: 2500, debtorKey: "acc-secret", kind: "payment", recordedBy: 1 });

    const change = await cancelDebtPayment(db.client, String(db.tables.debt_payments[0].id));

    expect(change?.after[0].left).toBe(2500);
    expect(db.tables.debt_payments[0].cancelled_at).toEqual(expect.any(String));
    expect(await cancelDebtPayment(db.client, String(db.tables.debt_payments[0].id))).toBeNull();
  });
});

describe("readSignupDebt", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("closes sign-ups for a debt past its noon", async () => {
    const db = fakeSupabase({
      client_bot_users: [{ debt_allowed_until: null, id: "acc-secret" }],
      debt_payments: [],
      player_debts: [debtRow()],
    });

    expect(await readSignupDebt(db.client, "acc-secret", now)).toContain("За игру 29.09");
  });

  it("lets in a player an admin allowed with /allowdebt", async () => {
    const db = fakeSupabase({
      client_bot_users: [{ debt_allowed_until: "2026-10-05T00:00:00.000Z", id: "acc-secret" }],
      debt_payments: [],
      player_debts: [debtRow()],
    });

    expect(await readSignupDebt(db.client, "acc-secret", now)).toBeNull();
  });

  it("lets the player through when the debt cannot be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = { from: () => { throw new Error("relation does not exist"); } };

    expect(await readSignupDebt(broken as never, "acc-secret", now)).toBeNull();
    logged.mockRestore();
  });
});
