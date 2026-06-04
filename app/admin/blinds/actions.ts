"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { blindPresets, type BlindPresetName } from "@/lib/timer/presets";

const levelSchema = z.object({
  levelOrder: z.number().int().positive(),
  smallBlind: z.number().int().positive().nullable(),
  bigBlind: z.number().int().positive().nullable(),
  ante: z.number().int().nonnegative().nullable(),
  durationSeconds: z.number().int().positive(),
  isBreak: z.boolean(),
  breakDurationSeconds: z.number().int().positive().nullable(),
});

export async function applyBlindPreset(formData: FormData) {
  const preset = String(formData.get("preset")) as BlindPresetName;
  const levels = blindPresets[preset];

  if (!levels) redirect("/admin/blinds?error=invalid_preset");

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) redirect("/admin/blinds?error=no_tournament");

  await supabase.from("blind_levels").delete().eq("tournament_id", tournament.id);
  await supabase.from("blind_levels").insert(
    levels.map((level) => ({
      tournament_id: tournament.id,
      level_order: level.levelOrder,
      small_blind: level.smallBlind,
      big_blind: level.bigBlind,
      ante: level.ante,
      duration_seconds: level.durationSeconds,
      is_break: level.isBreak,
      break_duration_seconds: level.breakDurationSeconds,
    })),
  );

  await broadcastPublicState(tournament.public_token as string);
  revalidatePath("/admin/blinds");
  redirect("/admin/blinds");
}

export async function saveBlindLevels(formData: FormData) {
  const raw = String(formData.get("levels") ?? "[]");
  const parsed = z.array(levelSchema).safeParse(JSON.parse(raw));

  if (!parsed.success) redirect("/admin/blinds?error=invalid_levels");

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) redirect("/admin/blinds?error=no_tournament");

  await supabase.from("blind_levels").delete().eq("tournament_id", tournament.id);
  await supabase.from("blind_levels").insert(
    parsed.data.map((level) => ({
      tournament_id: tournament.id,
      level_order: level.levelOrder,
      small_blind: level.isBreak ? null : level.smallBlind,
      big_blind: level.isBreak ? null : level.bigBlind,
      ante: level.isBreak ? null : level.ante,
      duration_seconds: level.durationSeconds,
      is_break: level.isBreak,
      break_duration_seconds: level.isBreak ? level.breakDurationSeconds : null,
    })),
  );

  await broadcastPublicState(tournament.public_token as string);
  revalidatePath("/admin/blinds");
  redirect("/admin/blinds");
}
