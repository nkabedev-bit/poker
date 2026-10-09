import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../debts/fake-supabase";

const mocks = vi.hoisted(() => ({
  markFinancePayments: vi.fn(),
  requireTmaAuth: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));
vi.mock("@/lib/google-sheets", () => ({ markFinancePayments: mocks.markFinancePayments }));
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => task(),
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const { DELETE, GET, POST } = await import("@/app/api/tma/debts/route");

function debt(id: string, debtorKey: string, name: string, amount: number, gameStartedAt: string) {
  return {
    account_id: debtorKey.startsWith("name:") ? null : debtorKey,
    amount,
    blocks_from: "2026-09-30T09:00:00.000Z",
    debtor_key: debtorKey,
    game_started_at: gameStartedAt,
    id,
    player_name: name,
    remind: false,
    source: "import",
  };
}

function club() {
  const db = fakeSupabase({
    client_bot_users: [{ debt_allowed_until: "2099-01-01T00:00:00.000Z", id: "acc-secret" }],
    debt_payments: [],
    player_debts: [
      debt("d1", "acc-secret", "Secret", 2500, "2026-09-24T16:00:00.000Z"),
      debt("d2", "acc-secret", "Secret", 4000, "2026-09-27T16:00:00.000Z"),
      debt("d3", "name:guest", "Guest", 1000, "2026-09-27T16:00:00.000Z"),
    ],
    tma_admins: [{ name: "Никита", telegram_id: 511564749 }],
  });
  mocks.requireTmaAuth.mockResolvedValue({ supabase: db.client, userId: 511564749 });
  return db;
}

const post = (body: unknown) =>
  POST(new Request("https://club.example/api/tma/debts", { body: JSON.stringify(body), method: "POST" }));

describe("/api/tma/debts", () => {
  beforeEach(() => {
    // The fake dates every payment 1 October 2026, and a debt closed a week before
    // "now" drops off the list: on the real clock the test began failing on 8 October.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    mocks.markFinancePayments.mockReset();
    mocks.requireTmaAuth.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists who owes, the largest debt first, with the evenings still open", async () => {
    club();

    const body = await (await GET(new Request("https://club.example/api/tma/debts"))).json();

    expect(body.debtors.map((item: { owed: number; playerName: string }) => [item.playerName, item.owed])).toEqual([
      ["Secret", 6500],
      ["Guest", 1000],
    ]);
    expect(body.debtors[0].allowedUntil).toBe("2099-01-01T00:00:00.000Z");
    expect(body.debtors[1].accountId).toBeNull();
  });

  // The case the club asked for: owes 6 500, brings 5 000.
  it("takes part of a debt and marks the evening it closed in the finance sheet", async () => {
    const db = club();

    const response = await post({ amount: 5000, debtorKey: "acc-secret", kind: "payment" });

    expect(await response.json()).toEqual({ owed: 1500 });
    expect(db.tables.debt_payments[0]).toMatchObject({ amount: 5000, recorded_by: 511564749 });
    expect(mocks.markFinancePayments).toHaveBeenCalledWith([
      { gameStartedAt: "2026-09-24T16:00:00.000Z", playerName: "Secret", status: "Да" },
      { gameStartedAt: "2026-09-27T16:00:00.000Z", playerName: "Secret", status: "Частично 2 500 из 4 000" },
    ]);
  });

  it("refuses a sum that is not whole rubles", async () => {
    club();

    expect((await post({ amount: 12.5, debtorKey: "acc-secret", kind: "payment" })).status).toBe(400);
  });

  it("refuses more than the player owes", async () => {
    club();

    const response = await post({ amount: 7000, debtorKey: "acc-secret", kind: "payment" });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("Сумма больше долга");
  });

  it("names the admin who took the money in the history", async () => {
    club();
    await post({ amount: 1000, debtorKey: "name:guest", kind: "payment" });

    const body = await (await GET(new Request("https://club.example/api/tma/debts"))).json();
    const guest = body.debtors.find((item: { debtorKey: string }) => item.debtorKey === "name:guest");

    // Paid in full a moment ago: still listed, so a mistake can be taken back.
    expect(guest.owed).toBe(0);
    expect(guest.payments[0]).toMatchObject({ amount: 1000, recordedBy: "Никита" });
  });

  it("takes back a payment and refuses an id that is not one", async () => {
    const db = club();
    await post({ amount: 2500, debtorKey: "acc-secret", kind: "payment" });

    // The fake's ids are not uuids, so the route's check is exercised with a bad one…
    const bad = await DELETE(new Request("https://club.example/api/tma/debts?payment=row-1", { method: "DELETE" }));
    expect(bad.status).toBe(400);

    // …and the cancellation itself with a real-looking one.
    db.tables.debt_payments[0].id = "8f2498f2-49ad-4cf8-ba7e-e68c0015e81c";
    const ok = await DELETE(
      new Request("https://club.example/api/tma/debts?payment=8f2498f2-49ad-4cf8-ba7e-e68c0015e81c", { method: "DELETE" }),
    );
    expect(await ok.json()).toEqual({ owed: 6500 });
  });
});
