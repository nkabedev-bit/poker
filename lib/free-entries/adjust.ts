import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Which account the pass belongs to: an app account, or the Telegram behind it. */
export type FreeEntryHolder = { accountId?: string | null; telegramId?: number | null };

export type FreeEntryChange = { after: number; before: number };

function isMissingRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "PGRST202" || String(message ?? "").includes("adjust_free_entries");
}

/**
 * Gives or takes back passes, counting from what the row holds at that moment.
 *
 * Every caller used to read the balance and write back `held ± 1`, so a player who took
 * two passes at once — a knockout with a mystery pass in each hand, or a pass and the
 * raffle — ended up one short: the second write counted from the same stale number.
 * Passes are money, so the sum is worked out inside the one statement that writes it.
 *
 * Taking away more than a player holds leaves them at zero rather than in debt, which
 * is why the change is reported rather than assumed.
 */
export async function adjustFreeEntries(
  supabase: SupabaseClient,
  { delta, holder, vip }: { delta: number; holder: FreeEntryHolder; vip: boolean },
): Promise<FreeEntryChange | null> {
  const accountId = holder.accountId ?? null;
  const telegramId = holder.telegramId ?? null;
  if (!accountId && telegramId === null) return null;

  const { data, error } = await supabase.rpc("adjust_free_entries", {
    p_account_id: accountId,
    p_delta: delta,
    p_telegram_id: accountId ? null : telegramId,
    p_vip: vip,
  });

  // The function is applied by hand, so a deploy can land before it exists. Until then
  // the old read-then-write keeps working — the race is rarer than a broken pass.
  if (error && isMissingRpc(error)) return adjustByReadingFirst(supabase, { delta, holder, vip });
  if (error) throw error;
  if (!data) return null;

  const change = data as { after?: unknown; before?: unknown };
  return { after: Number(change.after ?? 0), before: Number(change.before ?? 0) };
}

/** What every caller did before the function existed. Kept only as a fallback. */
async function adjustByReadingFirst(
  supabase: SupabaseClient,
  { delta, holder, vip }: { delta: number; holder: FreeEntryHolder; vip: boolean },
): Promise<FreeEntryChange | null> {
  const column = vip ? "vip_free_entries" : "free_entries";
  const by = holder.accountId
    ? { column: "id", value: holder.accountId as string | number }
    : { column: "telegram_id", value: holder.telegramId as string | number };

  const { data: account } = await supabase
    .from("client_bot_users")
    .select(column)
    .eq(by.column, by.value)
    .maybeSingle();

  if (!account) return null;

  const before = Math.max(0, Number((account as Record<string, number>)[column] ?? 0));
  const after = Math.max(0, before + delta);

  const { error } = await supabase
    .from("client_bot_users")
    .update({ [column]: after })
    .eq(by.column, by.value);

  if (error) throw error;

  return { after, before };
}
