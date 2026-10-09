import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { markFinancePayments } from "@/lib/google-sheets";
import { changedFinanceMarks, isDebtAllowed, sumLeft, unpaidCharges } from "@/lib/debts/ledger";
import {
  cancelDebtPayment,
  type DebtChange,
  readAllDebts,
  recordDebtPayment,
  settleByDebtor,
} from "@/lib/debts/store";

export const dynamic = "force-dynamic";

/** A player whose debt closed this recently stays on the list, so a mistaken payment can be taken back. */
const RECENTLY_CLOSED_MS = 7 * 24 * 60 * 60 * 1000;
const PAYMENTS_SHOWN = 10;
const MAX_PAYMENT = 1_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readAllowances(supabase: SupabaseClient, accountIds: string[]) {
  if (accountIds.length === 0) return new Map<string, string>();

  try {
    const { data, error } = await supabase
      .from("client_bot_users")
      .select("id, debt_allowed_until")
      .in("id", accountIds);
    if (error) throw error;

    return new Map(
      ((data ?? []) as Array<{ debt_allowed_until: string | null; id: string }>)
        .filter((row) => isDebtAllowed(row.debt_allowed_until))
        .map((row) => [row.id, row.debt_allowed_until as string]),
    );
  } catch (error) {
    console.error("Failed to read debt allowances", error);
    return new Map<string, string>();
  }
}

async function readAdminNames(supabase: SupabaseClient) {
  const { data } = await supabase.from("tma_admins").select("telegram_id, name");

  return new Map(
    ((data ?? []) as Array<{ name: string | null; telegram_id: number | string }>).map((row) => [
      Number(row.telegram_id),
      row.name ?? "",
    ]),
  );
}

/** The late payment is written into the evening's money tab after the answer. */
function markFinanceSheet(change: DebtChange) {
  const marks = changedFinanceMarks(change);
  if (marks.length === 0) return;

  after(async () => {
    try {
      await markFinancePayments(marks);
    } catch (sheetError) {
      console.error("Non-critical finance sheet mark error:", sheetError);
    }
  });
}

/** Everybody who owes the club, and those who closed their debt in the last week. */
export async function GET(request: Request) {
  const auth = await requireTmaAuth(request, { floorOnly: true });
  if (auth.error) return auth.error;

  const now = Date.now();
  const [ledger, adminNames] = await Promise.all([
    readAllDebts(auth.supabase),
    readAdminNames(auth.supabase),
  ]);

  const debtors = [...settleByDebtor(ledger)]
    .map(([debtorKey, { payments, settled }]) => {
      const active = payments.filter((payment) => !payment.cancelledAt);
      const lastPaymentAt = Math.max(0, ...active.map((payment) => Date.parse(payment.createdAt)));
      const latest = settled[settled.length - 1];
      const owed = sumLeft(settled);
      if (owed <= 0 && now - lastPaymentAt >= RECENTLY_CLOSED_MS) return null;

      return {
        accountId: settled.find((charge) => charge.accountId)?.accountId ?? null,
        debtorKey,
        games: unpaidCharges(settled).map((charge) => ({
          amount: charge.amount,
          gameStartedAt: charge.gameStartedAt,
          id: charge.id,
          left: charge.left,
          source: charge.source,
        })),
        owed,
        payments: [...payments]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, PAYMENTS_SHOWN)
          .map((payment) => ({
            amount: payment.amount,
            cancelledAt: payment.cancelledAt,
            createdAt: payment.createdAt,
            id: payment.id,
            kind: payment.kind,
            recordedBy:
              payment.recordedBy == null ? null : adminNames.get(payment.recordedBy) || "админ",
          })),
        playerName: latest?.playerName ?? payments[0]?.playerName ?? "",
      };
    })
    .filter((debtor) => debtor !== null);

  const allowances = await readAllowances(
    auth.supabase,
    debtors.map((debtor) => debtor.accountId).filter((id): id is string => Boolean(id)),
  );

  return NextResponse.json({
    debtors: debtors
      .map((debtor) => ({
        ...debtor,
        allowedUntil: debtor.accountId ? (allowances.get(debtor.accountId) ?? null) : null,
      }))
      .sort((a, b) => b.owed - a.owed || a.playerName.localeCompare(b.playerName, "ru")),
  });
}

/** Takes money from a player at the desk, or lets the rest of their debt go. */
export async function POST(request: Request) {
  const auth = await requireTmaAuth(request, { floorOnly: true });
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const debtorKey = typeof body.debtorKey === "string" ? body.debtorKey.trim() : "";
  const kind = body.kind === "writeoff" ? "writeoff" : "payment";
  const amount = Number(body.amount);

  if (!debtorKey) return NextResponse.json({ error: "Не выбран игрок" }, { status: 400 });
  if (kind === "payment" && (!Number.isInteger(amount) || amount <= 0 || amount > MAX_PAYMENT)) {
    return NextResponse.json({ error: "Впишите сумму в рублях" }, { status: 400 });
  }

  const outcome = await recordDebtPayment(auth.supabase, {
    amount,
    debtorKey,
    kind,
    recordedBy: Number(auth.userId) || null,
  });

  if (!outcome.change) return NextResponse.json({ error: outcome.error }, { status: 409 });

  markFinanceSheet(outcome.change);
  return NextResponse.json({ owed: sumLeft(outcome.change.after) });
}

/** Takes back a payment entered by mistake. */
export async function DELETE(request: Request) {
  const auth = await requireTmaAuth(request, { floorOnly: true });
  if (auth.error) return auth.error;

  const paymentId = new URL(request.url).searchParams.get("payment") ?? "";
  if (!UUID_PATTERN.test(paymentId)) {
    return NextResponse.json({ error: "Не выбрана оплата" }, { status: 400 });
  }

  const change = await cancelDebtPayment(auth.supabase, paymentId);
  if (!change) {
    return NextResponse.json({ error: "Оплата не найдена или уже отменена" }, { status: 404 });
  }

  markFinanceSheet(change);
  return NextResponse.json({ owed: sumLeft(change.after) });
}
