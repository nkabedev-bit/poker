import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

/** One line of the club's cancellations tab. */
export type CancellationRow = {
  cancellations: number;
  lastCancelledAt: string;
  player: string;
};

type CancellationRecord = {
  cancelled_at: string;
  user_id: string;
};

type AccountRow = {
  display_name: string | null;
  id: string;
};

/**
 * How often each player has dropped out, and when they last did.
 *
 * Counted by account rather than by nickname: this is the list the club decides a ban
 * from, and a ban is handed to an account. A player whose questionnaire has no nickname
 * still belongs on the list — the club knows who they are by their other rows.
 */
export function buildCancellationRows(
  cancellations: CancellationRecord[],
  accounts: AccountRow[],
): CancellationRow[] {
  const names = new Map(
    accounts.map((account) => [account.id, String(account.display_name ?? "").trim()]),
  );
  const tally = new Map<string, { count: number; lastCancelledAt: string }>();

  for (const record of cancellations) {
    const userId = String(record.user_id ?? "");
    const cancelledAt = String(record.cancelled_at ?? "");
    if (!userId || !cancelledAt) continue;

    const seen = tally.get(userId);
    tally.set(userId, {
      count: (seen?.count ?? 0) + 1,
      lastCancelledAt:
        seen && seen.lastCancelledAt > cancelledAt ? seen.lastCancelledAt : cancelledAt,
    });
  }

  return [...tally]
    .map(([userId, seen]) => ({
      cancellations: seen.count,
      lastCancelledAt: seen.lastCancelledAt,
      player: names.get(userId) || "Без ника",
    }))
    // The players the club would think about first come first.
    .sort(
      (a, b) =>
        b.cancellations - a.cancellations ||
        b.lastCancelledAt.localeCompare(a.lastCancelledAt) ||
        a.player.localeCompare(b.player, "ru"),
    );
}

async function readAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  order: string,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(order)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) return rows;
  }
}

/** The club's cancellation list, computed from the database. */
export async function readCancellationRows(
  supabase: SupabaseClient,
): Promise<CancellationRow[]> {
  const [cancellations, accounts] = await Promise.all([
    readAll<CancellationRecord>(supabase, "signup_cancellations", "user_id, cancelled_at", "cancelled_at"),
    readAll<AccountRow>(supabase, "client_bot_users", "id, display_name", "id"),
  ]);

  return buildCancellationRows(cancellations, accounts);
}
