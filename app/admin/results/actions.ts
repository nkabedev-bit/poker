"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeEditedRows } from "@/lib/results/edit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Replaces the finishing table of one past game with the corrected one.
 *
 * The standings are computed from these rows on every request, so fixing a row here is
 * all it takes — the monthly table, the player's history and that evening's table all
 * follow immediately, with nothing to recompute.
 */
export async function saveGameResults(formData: FormData) {
  const startedAt = z.string().min(1).parse(formData.get("startedAt"));
  const rows = normalizeEditedRows(JSON.parse(String(formData.get("rows") ?? "[]")));

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("tournament_results")
    .select("event_id, played_on, title, tournament_id")
    .eq("started_at", startedAt)
    .limit(1)
    .maybeSingle();

  if (!existing) {
    redirect("/admin/results?missing=1");
  }

  const game = existing as {
    event_id: string | null;
    played_on: string;
    title: string;
    tournament_id: string | null;
  };

  // Written before the removals: a failure between the two leaves the table complete
  // rather than missing the players who were never re-inserted.
  if (rows.length > 0) {
    const { error } = await supabase.from("tournament_results").upsert(
      rows.map((row) => ({
        event_id: game.event_id,
        knockouts: row.knockouts,
        place: row.place,
        played_on: game.played_on,
        player_name: row.playerName,
        points: row.points,
        source: "app",
        started_at: startedAt,
        telegram_id: row.telegramId,
        title: game.title,
        tournament_id: game.tournament_id,
      })),
      { onConflict: "started_at,player_name" },
    );

    if (error) throw error;
  }

  const keptNames = rows.map((row) => row.playerName);
  const removal = supabase.from("tournament_results").delete().eq("started_at", startedAt);
  const { error: deleteError } = await (keptNames.length > 0
    ? removal.not("player_name", "in", `(${keptNames.map((name) => `"${name}"`).join(",")})`)
    : removal);

  if (deleteError) throw deleteError;

  revalidatePath("/admin/results");
  redirect(`/admin/results?game=${encodeURIComponent(startedAt)}&saved=1`);
}

export async function deleteGameResults(formData: FormData) {
  const startedAt = z.string().min(1).parse(formData.get("startedAt"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("tournament_results")
    .delete()
    .eq("started_at", startedAt);

  if (error) throw error;

  revalidatePath("/admin/results");
  redirect("/admin/results?deleted=1");
}
