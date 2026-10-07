import type { SupabaseClient } from "@supabase/supabase-js";
import { findClientBotUserByNickname, type MatchedClientBotUser } from "@/lib/client-bot/nickname-match";
import {
  DEBT_ALLOWANCE_DAYS,
  formatGameDay,
  formatRubles,
  settleCharges,
  sumLeft,
} from "@/lib/debts/ledger";
import { readDebtorLedger, setDebtAllowance } from "@/lib/debts/store";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ALLOWANCE_DAYS = 60;

/** What the admin typed after /allowdebt or /denydebt, or null when they typed nothing. */
export function parseDebtCommand(text: string): string | null {
  const match = text.match(/^\/(?:allow|deny)debt(?:@\S+)?\s+(.+)$/i);
  const rest = match?.[1]?.trim() ?? "";

  return rest || null;
}

/**
 * Who the command is about, and for how many days.
 *
 * "Secret 3" is three days for Secret, but "Mers cls 055" is a nickname that ends in a
 * number. The trailing number is read as days only when the words before it name a
 * player; otherwise the whole line is the nickname.
 */
async function resolveDebtCommandPlayer(
  supabase: SupabaseClient,
  rest: string,
): Promise<{ days: number | null; error: string | null; user: MatchedClientBotUser | null }> {
  const days = rest.match(/^(.+?)\s+(\d{1,3})$/);

  if (days) {
    const count = Number(days[2]);
    const match = await findClientBotUserByNickname(supabase, days[1]);
    if (match.user && count >= 1 && count <= MAX_ALLOWANCE_DAYS) {
      return { days: count, error: null, user: match.user };
    }
  }

  const match = await findClientBotUserByNickname(supabase, rest);
  if (match.ambiguous) {
    return { days: null, error: `Ник «${rest}» встречается у нескольких игроков — уточните.`, user: null };
  }
  if (!match.user) {
    return { days: null, error: `Игрок «${rest}» не найден среди анкет.`, user: null };
  }

  return { days: null, error: null, user: match.user };
}

async function readOwed(supabase: SupabaseClient, accountId: string) {
  const ledger = await readDebtorLedger(supabase, accountId);
  return sumLeft(settleCharges(ledger.charges, ledger.payments));
}

/**
 * /allowdebt — lets a player sign up for a few days though their debt is still open.
 * The debt stays; the bot stops reminding them, and the admin is told when time is up.
 */
export async function allowPlayerDebt(
  supabase: SupabaseClient,
  { adminId, now = new Date(), rest }: { adminId: number; now?: Date; rest: string },
): Promise<string> {
  const resolved = await resolveDebtCommandPlayer(supabase, rest);
  if (!resolved.user) return resolved.error ?? "Игрок не найден.";

  const name = resolved.user.displayName || rest;
  const owed = await readOwed(supabase, resolved.user.id);
  if (owed <= 0) return `У «${name}» нет долга — запись и так открыта.`;

  const days = resolved.days ?? DEBT_ALLOWANCE_DAYS;
  const until = new Date(now.getTime() + days * DAY_MS);
  await setDebtAllowance(supabase, resolved.user.id, { by: adminId, until });

  return (
    `«${name}» может записываться на игры до ${formatGameDay(until.toISOString())}, ` +
    `хотя долг ${formatRubles(owed)} не закрыт. Напоминаний в эти дни не будет. ` +
    "Когда срок выйдет, я напишу вам."
  );
}

/** /denydebt — takes the permission back before its time. */
export async function denyPlayerDebt(supabase: SupabaseClient, rest: string): Promise<string> {
  const resolved = await resolveDebtCommandPlayer(supabase, rest);
  if (!resolved.user) return resolved.error ?? "Игрок не найден.";

  const name = resolved.user.displayName || rest;
  await setDebtAllowance(supabase, resolved.user.id, null);
  const owed = await readOwed(supabase, resolved.user.id);

  return owed > 0
    ? `Разрешение для «${name}» снято. Долг ${formatRubles(owed)} — запись на игры закрыта.`
    : `Разрешение для «${name}» снято. Долгов у игрока нет.`;
}
