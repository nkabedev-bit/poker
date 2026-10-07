import { buildPlayerCharge, type FinancePrices } from "@/lib/finance/player-charge";
import { hasRegistrationNumber } from "@/lib/player-registration-number";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import type { TournamentPlayer } from "@/lib/timer/types";

export type DebtSource = "app" | "import";

/** What one player was left owing for one evening. */
export type DebtCharge = {
  accountId: string | null;
  amount: number;
  /** From this moment the debt closes sign-ups. */
  blocksFrom: string;
  debtorKey: string;
  gameStartedAt: string;
  id: string;
  playerName: string;
  /** Whether the bot reminds about it. Debts carried over from the finance sheet do not. */
  remind: boolean;
  source: DebtSource;
};

export type DebtPaymentKind = "payment" | "writeoff";

/** Money brought to the desk, or a remainder the club let go. */
export type DebtPayment = {
  amount: number;
  cancelledAt: string | null;
  createdAt: string;
  debtorKey: string;
  id: string;
  kind: DebtPaymentKind;
  playerName: string;
  recordedBy: number | null;
};

/** An evening's debt with what has been paid and let go against it so far. */
export type SettledCharge = DebtCharge & { left: number; paid: number; writtenOff: number };

/** Who to write to about the debt. */
export const DEBT_CONTACT = "@markvasilyevv";

/** How long /allowdebt lets a player sign up when no number of days is given. */
export const DEBT_ALLOWANCE_DAYS = 7;

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Noon in Moscow, as hours after UTC midnight of the same date. */
const BLOCK_HOUR_UTC = 9;

const gameDayFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Moscow",
});

const rubles = new Intl.NumberFormat("ru-RU");

/**
 * Who owes: the club account, or — for a guest the desk typed in by hand — the nickname.
 * A guest cannot be barred or written to, but the desk still has to see what they owe.
 */
export function buildDebtorKey(accountId: string | null | undefined, playerName: string) {
  return accountId || `name:${buildNicknameKey(playerName)}`;
}

/**
 * When an evening's debt starts closing sign-ups: noon in Moscow the day after the game.
 * The night is left for a transfer to arrive and for the desk to tick it off.
 */
export function debtBlocksFrom(gameStartedAt: string) {
  const moscow = new Date(new Date(gameStartedAt).getTime() + MOSCOW_OFFSET_MS);
  const nextDay = Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate()) + DAY_MS;

  return new Date(nextDay + BLOCK_HOUR_UTC * 60 * 60 * 1000).toISOString();
}

/** "29.09" — the evening as the club names it. */
export function formatGameDay(gameStartedAt: string) {
  return gameDayFormat.format(new Date(gameStartedAt));
}

export function formatRubles(amount: number) {
  return `${rubles.format(amount)} ₽`;
}

/**
 * Spreads the money over the evenings, oldest first.
 *
 * A player who owes for three games and brings part of it has closed the earliest ones:
 * that is how the desk counts at the counter, and it leaves the newest evening — the one
 * the player still remembers — as the one still open. A payment taken back by mistake
 * counts for nothing.
 */
export function settleCharges(charges: DebtCharge[], payments: DebtPayment[]): SettledCharge[] {
  const settled = [...charges]
    .sort((a, b) => a.gameStartedAt.localeCompare(b.gameStartedAt) || a.id.localeCompare(b.id))
    .map((charge) => ({ ...charge, left: charge.amount, paid: 0, writtenOff: 0 }));

  const active = payments
    .filter((payment) => !payment.cancelledAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  for (const payment of active) {
    let money = payment.amount;

    for (const charge of settled) {
      if (money <= 0) break;
      if (charge.left <= 0) continue;

      const part = Math.min(money, charge.left);
      charge.left -= part;
      money -= part;
      if (payment.kind === "writeoff") charge.writtenOff += part;
      else charge.paid += part;
    }
  }

  return settled;
}

export function sumLeft(settled: SettledCharge[]) {
  return settled.reduce((total, charge) => total + charge.left, 0);
}

/** The evenings still owed for, oldest first. */
export function unpaidCharges(settled: SettledCharge[]) {
  return settled.filter((charge) => charge.left > 0);
}

/** Whether what is owed already closes sign-ups. Last night's game waits until noon. */
export function isBlockingDebt(settled: SettledCharge[], now: Date = new Date()) {
  return settled.some(
    (charge) => charge.left > 0 && new Date(charge.blocksFrom).getTime() <= now.getTime(),
  );
}

export function isDebtAllowed(allowedUntil: string | null | undefined, now: Date = new Date()) {
  if (!allowedUntil) return false;

  const until = new Date(allowedUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

/** "за игры 27.09, 29.09 не оплачено 9 000 ₽" */
function describeUnpaid(unpaid: SettledCharge[]) {
  const days = unpaid.map((charge) => formatGameDay(charge.gameStartedAt)).join(", ");
  const games = unpaid.length === 1 ? "игру" : "игры";

  return `за ${games} ${days} не оплачено ${formatRubles(sumLeft(unpaid))}`;
}

const DEBT_CLOSES_SIGNUPS =
  `Пока долг не закрыт, запись на турниры недоступна. Напишите, пожалуйста, ${DEBT_CONTACT}`;

/** What the player reads in place of the sign-up button. */
export function buildDebtBlockMessage(unpaid: SettledCharge[]) {
  const line = describeUnpaid(unpaid);

  return `${line[0].toUpperCase()}${line.slice(1)}. ${DEBT_CLOSES_SIGNUPS}`;
}

/** The evening reminder in the bot. */
export function buildDebtReminderMessage(unpaid: SettledCharge[]) {
  return `Напоминаем: ${describeUnpaid(unpaid)}. ${DEBT_CLOSES_SIGNUPS}`;
}

/** What the finance sheet's "Оплатил" column says about one evening. */
export function describeFinancePayment(charge: SettledCharge) {
  if (charge.left === charge.amount) return "Нет";
  if (charge.left > 0) return `Частично ${rubles.format(charge.paid + charge.writtenOff)} из ${rubles.format(charge.amount)}`;
  if (charge.writtenOff === 0) return "Да";
  if (charge.paid === 0) return "Списан";

  return `Оплачено ${rubles.format(charge.paid)}, остальное списано`;
}

/**
 * The evening's bills the room left unpaid.
 *
 * Only players who were here — a sign-up without a ticket owes nothing, the same rule
 * the finance sheet follows — and only a bill above zero: a pass, or the venue's owner,
 * leaves nothing to chase.
 */
export function buildEveningDebts(players: TournamentPlayer[], prices: FinancePrices) {
  return players
    .filter((player) => hasRegistrationNumber(player) && !player.paid)
    .map((player) => ({ amount: buildPlayerCharge(player, prices).total, player }))
    .filter((item) => item.amount > 0);
}

/**
 * The evenings whose "Оплатил" cell a payment changed — the only cells worth a write.
 */
export function changedFinanceMarks(change: { after: SettledCharge[]; before: SettledCharge[] }) {
  const before = new Map(change.before.map((charge) => [charge.id, describeFinancePayment(charge)]));

  return change.after
    .map((charge) => ({
      gameStartedAt: charge.gameStartedAt,
      playerName: charge.playerName,
      status: describeFinancePayment(charge),
      was: before.get(charge.id),
    }))
    .filter((mark) => mark.status !== mark.was)
    .map(({ gameStartedAt, playerName, status }) => ({ gameStartedAt, playerName, status }));
}
