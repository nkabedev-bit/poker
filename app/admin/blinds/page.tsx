import { applyBlindPreset, saveBlindLevels } from "@/app/admin/blinds/actions";
import { BlindsEditor } from "@/components/admin/blinds-editor";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BlindLevel } from "@/lib/timer/types";

export const dynamic = "force-dynamic";

export default async function BlindsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("blind_levels")
    .select("id, level_order, small_blind, big_blind, ante, duration_seconds, is_break, break_duration_seconds")
    .order("level_order", { ascending: true });

  const levels: BlindLevel[] = (data ?? []).map((row) => ({
    id: row.id as string,
    levelOrder: row.level_order as number,
    smallBlind: row.small_blind as number | null,
    bigBlind: row.big_blind as number | null,
    ante: row.ante as number | null,
    durationSeconds: row.duration_seconds as number,
    isBreak: row.is_break as boolean,
    breakDurationSeconds: row.break_duration_seconds as number | null,
  }));

  return (
    <BlindsEditor
      applyPreset={applyBlindPreset}
      levels={levels}
      saveLevels={saveBlindLevels}
    />
  );
}
