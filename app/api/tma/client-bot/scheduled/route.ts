import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import {
  selectBroadcastsToForget,
  selectVisibleBroadcasts,
  type BroadcastHistoryRow,
} from "@/lib/client-bot/broadcast-history";

export const dynamic = "force-dynamic";

/**
 * Drops the broadcasts the history no longer keeps. Run after the answer is sent: the
 * admin is looking at a trimmed list either way, and a failed cleanup must not cost
 * them the screen.
 */
async function forgetOldBroadcasts(supabase: SupabaseClient, rows: BroadcastHistoryRow[]) {
  const forgotten = selectBroadcastsToForget(rows);
  if (forgotten.length === 0) return;

  const { error } = await supabase.from("scheduled_broadcasts").delete().in("id", forgotten);
  if (error) console.error("Failed to trim the broadcast history", error);
}

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("scheduled_broadcasts")
    .select("id, message, send_at, status, sent_at, result")
    .order("send_at", { ascending: false })
    // Read wide enough that a long-neglected history is cleared in one visit.
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<BroadcastHistoryRow & Record<string, unknown>>;
  after(() => forgetOldBroadcasts(auth.supabase, rows));

  return NextResponse.json({ items: selectVisibleBroadcasts(rows) });
}
