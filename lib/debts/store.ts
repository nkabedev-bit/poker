import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPlayerCharge, getFinancePrices, type FinancePrices } from "@/lib/finance/player-charge";
import { findClientBotUserByNickname } from "@/lib/client-bot/nickname-match";
import { readAllPages } from "@/lib/supabase/read-all-pages";
import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";
import {
  buildDebtBlockMessage,
  buildDebtorKey,
  buildEveningDebts,
  debtBlocksFrom,
  type DebtCharge,
  type DebtPayment,
  type DebtPaymentKind,
  isBlockingDebt,
  isDebtAllowed,
  type SettledCharge,
  settleCharges,
  sumLeft,
  unpaidCharges,
} from "@/lib/debts/ledger";

const CHARGE_COLUMNS =
  "id, debtor_key, account_id, player_name, game_started_at, amount, blocks_from, remind, source";
const PAYMENT_COLUMNS =
  "id, debtor_key, player_name, amount, kind, recorded_by, created_at, cancelled_at";

type ChargeRow = {
  account_id: string | null;
  amount: number;
  blocks_from: string;
  debtor_key: string;
  game_started_at: string;
  id: string;
  player_name: string;
  remind: boolean;
  source: string;
};

type PaymentRow = {
  amount: number;
  cancelled_at: string | null;
  created_at: string;
  debtor_key: string;
  id: string;
  kind: string;
  player_name: string;
  recorded_by: number | string | null;
};

function mapCharge(row: ChargeRow): DebtCharge {
  return {
    accountId: row.account_id,
    amount: Number(row.amount),
    blocksFrom: row.blocks_from,
    debtorKey: row.debtor_key,
    gameStartedAt: row.game_started_at,
    id: row.id,
    playerName: row.player_name,
    remind: row.remind,
    source: row.source === "import" ? "import" : "app",
  };
}

function mapPayment(row: PaymentRow): DebtPayment {
  return {
    amount: Number(row.amount),
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    debtorKey: row.debtor_key,
    id: row.id,
    kind: row.kind === "writeoff" ? "writeoff" : "payment",
    playerName: row.player_name,
    recordedBy: row.recorded_by == null ? null : Number(row.recorded_by),
  };
}

export type DebtLedger = { charges: DebtCharge[]; payments: DebtPayment[] };

/** One player's evenings and payments. */
export async function readDebtorLedger(
  supabase: SupabaseClient,
  debtorKey: string,
): Promise<DebtLedger> {
  const [charges, payments] = await Promise.all([
    supabase.from("player_debts").select(CHARGE_COLUMNS).eq("debtor_key", debtorKey),
    supabase.from("debt_payments").select(PAYMENT_COLUMNS).eq("debtor_key", debtorKey),
  ]);

  if (charges.error) throw charges.error;
  if (payments.error) throw payments.error;

  return {
    charges: ((charges.data ?? []) as ChargeRow[]).map(mapCharge),
    payments: ((payments.data ?? []) as PaymentRow[]).map(mapPayment),
  };
}

/** Every debt the club has written down, and every payment against them. */
export async function readAllDebts(supabase: SupabaseClient): Promise<DebtLedger> {
  const [charges, payments] = await Promise.all([
    readAllPages<ChargeRow>((from, to) =>
      supabase.from("player_debts").select(CHARGE_COLUMNS).order("id").range(from, to),
    ),
    readAllPages<PaymentRow>((from, to) =>
      supabase.from("debt_payments").select(PAYMENT_COLUMNS).order("id").range(from, to),
    ),
  ]);

  return { charges: charges.map(mapCharge), payments: payments.map(mapPayment) };
}

/** Groups a ledger by player, each settled oldest evening first. */
export function settleByDebtor(ledger: DebtLedger) {
  const byDebtor = new Map<string, DebtLedger>();
  const entry = (key: string) => {
    const found = byDebtor.get(key) ?? { charges: [], payments: [] };
    byDebtor.set(key, found);
    return found;
  };

  for (const charge of ledger.charges) entry(charge.debtorKey).charges.push(charge);
  for (const payment of ledger.payments) entry(payment.debtorKey).payments.push(payment);

  return new Map(
    [...byDebtor].map(([key, own]) => [
      key,
      { payments: own.payments, settled: settleCharges(own.charges, own.payments) },
    ]),
  );
}

/** The /allowdebt permission, read on its own for the same reason as the sign-up ban. */
export async function readDebtAllowance(
  supabase: SupabaseClient,
  accountId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("client_bot_users")
    .select("debt_allowed_until")
    .eq("id", accountId)
    .maybeSingle();

  if (error) throw error;

  const until = (data as { debt_allowed_until?: unknown } | null)?.debt_allowed_until;
  return typeof until === "string" ? until : null;
}

export async function setDebtAllowance(
  supabase: SupabaseClient,
  accountId: string,
  allowance: { by: number; until: Date } | null,
) {
  const { error } = await supabase
    .from("client_bot_users")
    .update({
      debt_allowed_by: allowance?.by ?? null,
      debt_allowed_until: allowance?.until.toISOString() ?? null,
    })
    .eq("id", accountId);

  if (error) throw error;
}

/**
 * What stands between this player and a sign-up, or null when nothing does.
 *
 * Read apart from the account and failing open, like the cancellation ban: a debt that
 * cannot be read lets the player through, rather than one missing table closing the
 * club's door to everybody.
 */
export async function readSignupDebt(
  supabase: SupabaseClient,
  accountId: string,
  now: Date = new Date(),
): Promise<string | null> {
  try {
    const ledger = await readDebtorLedger(supabase, buildDebtorKey(accountId, ""));
    if (ledger.charges.length === 0) return null;

    const settled = settleCharges(ledger.charges, ledger.payments);
    if (!isBlockingDebt(settled, now)) return null;
    if (isDebtAllowed(await readDebtAllowance(supabase, accountId), now)) return null;

    return buildDebtBlockMessage(unpaidCharges(settled));
  } catch (error) {
    console.error("Failed to read the player's debt", error);
    return null;
  }
}

/**
 * The club account behind a seat. Set on everyone seated from a sign-up; a player the
 * desk typed in is found by Telegram id, or by a nickname only one questionnaire carries.
 */
async function resolveSeatAccount(
  supabase: SupabaseClient,
  player: Pick<TournamentPlayer, "accountId" | "name" | "telegramId">,
): Promise<string | null> {
  if (player.accountId) return player.accountId;

  if (player.telegramId) {
    const { data } = await supabase
      .from("client_bot_users")
      .select("id")
      .eq("telegram_id", player.telegramId)
      .maybeSingle();
    const id = (data as { id?: unknown } | null)?.id;
    if (typeof id === "string") return id;
  }

  const match = await findClientBotUserByNickname(supabase, player.name);
  return match.user?.id ?? null;
}

type EveningContext = {
  gameStartedAt: string;
  prices: FinancePrices;
  supabase: SupabaseClient;
  tournamentId: string;
};

async function buildChargeRow(
  { gameStartedAt, supabase, tournamentId }: EveningContext,
  player: TournamentPlayer,
  amount: number,
) {
  const accountId = await resolveSeatAccount(supabase, player);

  return {
    account_id: accountId,
    amount,
    blocks_from: debtBlocksFrom(gameStartedAt),
    debtor_key: buildDebtorKey(accountId, player.name),
    game_started_at: gameStartedAt,
    player_name: player.name,
    remind: true,
    source: "app",
    tournament_id: tournamentId,
  };
}

/**
 * Writes down what the room left unpaid at the finish. Writing the same evening again
 * replaces its rows rather than doubling them.
 */
export async function recordEveningDebts(
  context: EveningContext & { players: TournamentPlayer[] },
) {
  const owed = buildEveningDebts(context.players, context.prices);
  if (owed.length === 0) return { recorded: 0 };

  const rows = await Promise.all(
    owed.map(({ amount, player }) => buildChargeRow(context, player, amount)),
  );

  const { error } = await context.supabase
    .from("player_debts")
    .upsert(rows, { onConflict: "game_started_at,debtor_key" });

  if (error) throw error;
  return { recorded: rows.length };
}

/**
 * The desk ticks a player off in the hour after the finish: the evening's debt goes.
 * Taking the tick back writes it again.
 */
export async function setEveningDebtPaid(
  context: EveningContext & { paid: boolean; player: TournamentPlayer },
) {
  const { player, supabase } = context;
  const amount = buildPlayerCharge(player, context.prices).total;
  const row = await buildChargeRow(context, player, amount);

  if (context.paid || amount <= 0) {
    const { error } = await supabase
      .from("player_debts")
      .delete()
      .eq("game_started_at", context.gameStartedAt)
      .eq("debtor_key", row.debtor_key);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("player_debts")
    .upsert([row], { onConflict: "game_started_at,debtor_key" });
  if (error) throw error;
}

export type DebtChange = { after: SettledCharge[]; before: SettledCharge[] };

/**
 * Takes money from a player, or lets the rest of their debt go.
 *
 * Never more than they owe: the club does not keep credit, and a mistyped extra zero
 * should be refused rather than silently swallowed.
 */
export async function recordDebtPayment(
  supabase: SupabaseClient,
  entry: { amount: number; debtorKey: string; kind: DebtPaymentKind; recordedBy: number | null },
): Promise<{ change: DebtChange; error: null } | { change: null; error: string }> {
  const ledger = await readDebtorLedger(supabase, entry.debtorKey);
  const before = settleCharges(ledger.charges, ledger.payments);
  const owed = sumLeft(before);

  if (owed <= 0) return { change: null, error: "У игрока нет долга" };

  const amount = entry.kind === "writeoff" ? owed : entry.amount;
  if (amount > owed) return { change: null, error: "Сумма больше долга" };

  const latest = before[before.length - 1];
  const { data, error } = await supabase
    .from("debt_payments")
    .insert({
      account_id: latest.accountId,
      amount,
      debtor_key: entry.debtorKey,
      kind: entry.kind,
      player_name: latest.playerName,
      recorded_by: entry.recordedBy,
    })
    .select(PAYMENT_COLUMNS)
    .single();

  if (error) throw error;

  const after = settleCharges(ledger.charges, [...ledger.payments, mapPayment(data as PaymentRow)]);
  return { change: { after, before }, error: null };
}

/** Takes back a payment entered by mistake; it stays in the history, crossed out. */
export async function cancelDebtPayment(
  supabase: SupabaseClient,
  paymentId: string,
): Promise<DebtChange | null> {
  const { data, error } = await supabase
    .from("debt_payments")
    .select(PAYMENT_COLUMNS)
    .eq("id", paymentId)
    .is("cancelled_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const payment = mapPayment(data as PaymentRow);
  const ledger = await readDebtorLedger(supabase, payment.debtorKey);
  const before = settleCharges(ledger.charges, ledger.payments);

  const cancelledAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("debt_payments")
    .update({ cancelled_at: cancelledAt })
    .eq("id", paymentId);

  if (updateError) throw updateError;

  const after = settleCharges(
    ledger.charges,
    ledger.payments.map((item) => (item.id === paymentId ? { ...item, cancelledAt } : item)),
  );
  return { after, before };
}

/**
 * Turns the evening's unpaid bills into debts as the game ends, before the roster goes.
 *
 * Never allowed to hold up the finish: a failure is logged, and the desk's copy of the
 * roster still has the evening for the hour after it.
 */
export async function recordFinishedEveningDebts(
  supabase: SupabaseClient,
  extras: Pick<TournamentExtras, "players" | "settings">,
  tournamentId: string,
) {
  try {
    const gameStartedAt = extras.settings?.sheetsSessionStartedAt;
    if (!gameStartedAt || !extras.players?.length) return;

    await recordEveningDebts({
      gameStartedAt,
      players: extras.players,
      prices: getFinancePrices(extras.settings),
      supabase,
      tournamentId,
    });
  } catch (error) {
    console.error("Failed to record the evening's debts", error);
  }
}
