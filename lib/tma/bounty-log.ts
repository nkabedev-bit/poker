import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingBountyLogSnapshotColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "");
  return message.includes("players_before")
    || message.includes("players_after")
    || message.includes("uses_reentry")
    || message.includes("reentry_double")
    || message.includes("sheets_row_id")
    || message.includes("sheets_sheet_name")
    || message.includes("mystery_bounty_points");
}

/**
 * Inserts a bounty_log row, retrying without the snapshot columns when the database
 * has not been migrated to them yet.
 */
export async function insertBountyLogRecord(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase.from("bounty_log").insert(payload).select().single();
  if (!error) return data;

  if (!isMissingBountyLogSnapshotColumnError(error)) throw error;

  const legacyPayload = { ...payload };
  delete legacyPayload.players_after;
  delete legacyPayload.players_before;
  delete legacyPayload.uses_reentry;
  delete legacyPayload.reentry_double;
  delete legacyPayload.mystery_bounty_points;

  console.warn("bounty_log snapshot columns are unavailable; retrying legacy insert", error);
  const { data: legacyData, error: legacyError } = await supabase
    .from("bounty_log")
    .insert(legacyPayload)
    .select()
    .single();

  if (legacyError) throw legacyError;
  return legacyData;
}
