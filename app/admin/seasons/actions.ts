"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { listSeasons, writeSeasonSnapshot } from "@/lib/seasons/store";
import { mapSeasonRow } from "@/lib/seasons/season";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SEASON_COLUMNS = "id, title, starts_on, ends_on, counted_games, status";

const seasonSchema = z.object({
  countedGames: z.coerce.number().int().positive().nullable(),
  startsOn: z.string().trim().min(1, "Укажите дату начала"),
  title: z.string().trim().min(1, "Укажите название").max(80),
});

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

async function readSeason(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: string) {
  const { data } = await supabase.from("seasons").select(SEASON_COLUMNS).eq("id", id).maybeSingle();
  return data ? mapSeasonRow(data as Record<string, unknown>) : null;
}

/**
 * Opens a season. Only one collects games at a time, so the previous one is frozen and
 * closed first — otherwise tonight's game would belong to two seasons at once.
 */
export async function openSeason(formData: FormData) {
  const parsed = seasonSchema.parse({
    countedGames: optionalNumber(formData.get("countedGames")),
    startsOn: formData.get("startsOn"),
    title: formData.get("title"),
  });

  const supabase = await createSupabaseServerClient();
  const open = (await listSeasons(supabase)).find((season) => season.status === "open");

  if (open) {
    await writeSeasonSnapshot(supabase, open);
    const { error } = await supabase
      .from("seasons")
      .update({ closed_at: new Date().toISOString(), ends_on: parsed.startsOn, status: "closed" })
      .eq("id", open.id);

    if (error) throw error;
  }

  const { error } = await supabase.from("seasons").insert({
    counted_games: parsed.countedGames,
    starts_on: parsed.startsOn,
    status: "open",
    title: parsed.title,
  });

  if (error) throw error;

  revalidatePath("/admin/seasons");
  redirect("/admin/seasons?opened=1");
}

/** Closes a season and freezes its table as it stands. */
export async function closeSeason(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const endsOn =
    String(formData.get("endsOn") ?? "").trim() || new Date().toISOString().slice(0, 10);

  const supabase = await createSupabaseServerClient();
  const season = await readSeason(supabase, id);
  if (!season) redirect("/admin/seasons?missing=1");

  await writeSeasonSnapshot(supabase, season);

  const { error } = await supabase
    .from("seasons")
    .update({ closed_at: new Date().toISOString(), ends_on: endsOn, status: "closed" })
    .eq("id", id);

  if (error) throw error;

  revalidatePath("/admin/seasons");
  redirect("/admin/seasons?closed=1");
}

/** Rebuilds a frozen table — the deliberate way to apply corrections to a closed season. */
export async function recomputeSeason(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));

  const supabase = await createSupabaseServerClient();
  const season = await readSeason(supabase, id);
  if (!season) redirect("/admin/seasons?missing=1");

  await writeSeasonSnapshot(supabase, season);

  revalidatePath("/admin/seasons");
  redirect("/admin/seasons?recomputed=1");
}

/**
 * Attaches games played inside a season's dates to it. Imported history, and any game
 * finished while no season was open, carry no season — this is how they get one.
 */
export async function attachGamesByDate(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));

  const supabase = await createSupabaseServerClient();
  const season = await readSeason(supabase, id);
  if (!season) redirect("/admin/seasons?missing=1");

  let query = supabase
    .from("tournament_results")
    .update({ season_id: season.id })
    .is("season_id", null)
    .gte("played_on", season.startsOn);

  if (season.endsOn) query = query.lte("played_on", season.endsOn);

  const { error } = await query;
  if (error) throw error;

  revalidatePath("/admin/seasons");
  redirect("/admin/seasons?attached=1");
}
