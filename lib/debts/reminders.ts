import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDebtReminderMessage,
  formatRubles,
  isDebtAllowed,
  settleCharges,
  sumLeft,
} from "@/lib/debts/ledger";
import { readAllDebts, readDebtorLedger, settleByDebtor } from "@/lib/debts/store";

type WriteToPlayer = (accountId: string, message: string) => Promise<boolean>;
type WriteToAdmin = (adminId: number, message: string) => Promise<void>;

/**
 * The 18:00 reminder: one message to every player whose debt already closes sign-ups.
 *
 * Only about debts the app wrote down itself — the ones carried over from the finance
 * sheet may hold the sheet's mistakes, and the club checks those by hand. Nobody an
 * admin let in with /allowdebt is written to while the permission lasts.
 */
export async function sendDebtReminders(
  supabase: SupabaseClient,
  writeToPlayer: WriteToPlayer,
  now: Date = new Date(),
) {
  const byDebtor = settleByDebtor(await readAllDebts(supabase));
  const due = [...byDebtor.values()]
    .map(({ settled }) => ({
      accountId: settled.find((charge) => charge.accountId)?.accountId ?? null,
      charges: settled.filter(
        (charge) =>
          charge.remind && charge.left > 0 && new Date(charge.blocksFrom).getTime() <= now.getTime(),
      ),
    }))
    .filter((item): item is { accountId: string; charges: typeof item.charges } =>
      Boolean(item.accountId) && item.charges.length > 0,
    );

  if (due.length === 0) return { reminded: 0, skipped: 0 };

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("id, debt_allowed_until")
    .in(
      "id",
      due.map((item) => item.accountId),
    );
  if (error) throw error;

  const allowed = new Set(
    ((data ?? []) as Array<{ debt_allowed_until: string | null; id: string }>)
      .filter((row) => isDebtAllowed(row.debt_allowed_until, now))
      .map((row) => row.id),
  );

  let reminded = 0;
  let skipped = 0;
  for (const item of due) {
    if (allowed.has(item.accountId)) {
      skipped += 1;
      continue;
    }

    // A player who blocked the bot, or signed in on the web only, is simply not reached:
    // they read the same words on the poster instead of the sign-up button.
    if (await writeToPlayer(item.accountId, buildDebtReminderMessage(item.charges))) reminded += 1;
    else skipped += 1;
  }

  return { reminded, skipped };
}

type EndedAllowance = {
  debt_allowed_by: number | string;
  debt_allowed_until: string;
  display_name: string | null;
  id: string;
};

/**
 * Tells the admin who gave a /allowdebt that it has run out and the player is barred
 * again. A player who settled up in the meantime is not worth a message.
 */
export async function announceEndedAllowances(
  supabase: SupabaseClient,
  writeToAdmin: WriteToAdmin,
  now: Date = new Date(),
) {
  const { data, error } = await supabase
    .from("client_bot_users")
    .select("id, display_name, debt_allowed_by, debt_allowed_until")
    .not("debt_allowed_by", "is", null)
    .lte("debt_allowed_until", now.toISOString());
  if (error) throw error;

  let announced = 0;
  for (const row of (data ?? []) as EndedAllowance[]) {
    const adminId = Number(row.debt_allowed_by);

    // Cleared first, and only while it is still this same permission: a message is sent
    // once, and a /allowdebt given again a moment ago is left alone.
    const { data: cleared, error: clearError } = await supabase
      .from("client_bot_users")
      .update({ debt_allowed_by: null, debt_allowed_until: null })
      .eq("id", row.id)
      .eq("debt_allowed_until", row.debt_allowed_until)
      .select("id");
    if (clearError) throw clearError;
    if (!cleared || cleared.length === 0) continue;

    const ledger = await readDebtorLedger(supabase, row.id);
    const owed = sumLeft(settleCharges(ledger.charges, ledger.payments));
    if (owed <= 0) continue;

    try {
      await writeToAdmin(
        adminId,
        `Разрешение /allowdebt для «${row.display_name || "игрока"}» закончилось. ` +
          `Долг ${formatRubles(owed)} — теперь игрок не может записываться на игры.`,
      );
      announced += 1;
    } catch (sendError) {
      console.error("Failed to tell the admin an allowance ended", sendError);
    }
  }

  return { announced };
}
