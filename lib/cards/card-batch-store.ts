import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CARD_BATCH_MAX, type CardBatch } from "@/lib/cards/card-batch";

const BATCH_COLUMNS = "id, prefix, start_number, count, created_at";

function mapBatchRow(row: Record<string, unknown>): CardBatch {
  return {
    count: Number(row.count ?? 0),
    createdAt: String(row.created_at ?? ""),
    id: String(row.id ?? ""),
    prefix: String(row.prefix ?? ""),
    startNumber: Number(row.start_number ?? 1),
  };
}

/** Every run the club has printed, newest first — the way the page lists them. */
export async function listCardBatches(supabase: SupabaseClient): Promise<CardBatch[]> {
  const { data, error } = await supabase
    .from("card_batches")
    .select(BATCH_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => mapBatchRow(row as Record<string, unknown>));
}

export async function saveCardBatch(
  supabase: SupabaseClient,
  batch: { count: number; prefix: string; startNumber: number },
): Promise<CardBatch> {
  const { data, error } = await supabase
    .from("card_batches")
    .insert({
      count: Math.min(CARD_BATCH_MAX, Math.max(1, Math.floor(batch.count) || 1)),
      prefix: batch.prefix,
      start_number: Math.max(1, Math.floor(batch.startNumber) || 1),
    })
    .select(BATCH_COLUMNS)
    .single();

  if (error) throw error;

  return mapBatchRow(data as Record<string, unknown>);
}

export async function deleteCardBatch(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("card_batches").delete().eq("id", id);
  if (error) throw error;
}
