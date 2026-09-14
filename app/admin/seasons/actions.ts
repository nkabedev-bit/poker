"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { listSeasons, writeSeasonSnapshot } from "@/lib/seasons/store";
import { mapSeasonRow } from "@/lib/seasons/season";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Every column: whether a season is parallel decides how it is counted and closed, and
// that column is missing until migration 202609140001 is applied.
const SEASON_COLUMNS = "*";

const seasonSchema = z.object({
  countedGames: z.coerce.number().int().positive().nullable(),
  startsOn: z.string().trim().min(1, "Укажите дату начала"),
  title: z.string().trim().min(1, "Укажите название").max(80),
});

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

/** Back to the seasons screen with something the admin can act on. */
function seasonsNotice(message: string) {
  return `/admin/seasons?error=${encodeURIComponent(message)}`;
}

async function readSeason(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: string) {
  const { data } = await supabase.from("seasons").select(SEASON_COLUMNS).eq("id", id).maybeSingle();
  return data ? mapSeasonRow(data as Record<string, unknown>) : null;
}

/**
 * Opens a season.
 *
 * Regular seasons collect games one at a time, so the regular season still open is frozen
 * and closed first — otherwise tonight's game would belong to two of them. A parallel
 * season (the APC cup qualifier) runs beside it and closes nothing.
 */
export async function openSeason(formData: FormData) {
  const parsed = seasonSchema.parse({
    countedGames: optionalNumber(formData.get("countedGames")),
    startsOn: formData.get("startsOn"),
    title: formData.get("title"),
  });
  const parallel = formData.get("parallel") === "yes";
  // Only a parallel season is given its end up front: its dates are what it holds.
  const endsOn = parallel ? String(formData.get("endsOn") ?? "").trim() || null : null;

  if (endsOn && endsOn < parsed.startsOn) {
    redirect(seasonsNotice("Конец сезона раньше его начала."));
  }

  const supabase = await createSupabaseServerClient();

  if (!parallel) {
    const open = (await listSeasons(supabase)).find(
      (season) => season.status === "open" && !season.parallel,
    );

    if (open) {
      await writeSeasonSnapshot(supabase, open);
      const { error } = await supabase
        .from("seasons")
        .update({ closed_at: new Date().toISOString(), ends_on: parsed.startsOn, status: "closed" })
        .eq("id", open.id);

      if (error) throw error;
    }
  }

  const { error } = await supabase.from("seasons").insert({
    counted_games: parsed.countedGames,
    ends_on: endsOn,
    // Sent only for a parallel season, so a regular one still opens while the migration
    // adding the column is waiting to be applied.
    ...(parallel ? { parallel: true } : {}),
    starts_on: parsed.startsOn,
    status: "open",
    title: parsed.title,
  });

  if (error && parallel && String(error.message).includes("parallel")) {
    redirect(
      seasonsNotice(
        "Параллельный сезон не открыт: сначала примените миграцию 202609140001_parallel_seasons.sql в Supabase SQL Editor.",
      ),
    );
  }

  if (error) throw error;

  revalidatePath("/admin/seasons");
  redirect("/admin/seasons?opened=1");
}

/**
 * Edits a season: its name, its dates and its scoring rule.
 *
 * The rule matters most. Imported seasons arrived with whatever total the club's sheet
 * carried — often the sum of every game — while the club actually scored a player's
 * five best. Setting the rule here and recomputing puts that right.
 */
export async function updateSeason(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const parsed = seasonSchema.parse({
    countedGames: optionalNumber(formData.get("countedGames")),
    startsOn: formData.get("startsOn"),
    title: formData.get("title"),
  });
  const endsOn = String(formData.get("endsOn") ?? "").trim() || null;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("seasons")
    .update({
      counted_games: parsed.countedGames,
      ends_on: endsOn,
      starts_on: parsed.startsOn,
      title: parsed.title,
    })
    .eq("id", id);

  if (error) throw error;

  revalidatePath("/admin/seasons");
  redirect("/admin/seasons?updated=1");
}

/** Closes a season and freezes its table as it stands. */
export async function closeSeason(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const closedOn =
    String(formData.get("endsOn") ?? "").trim() || new Date().toISOString().slice(0, 10);

  const supabase = await createSupabaseServerClient();
  const season = await readSeason(supabase, id);
  if (!season) redirect("/admin/seasons?missing=1");

  await writeSeasonSnapshot(supabase, season);

  // A parallel season is its dates. Closing it the morning after its last evening must
  // not stretch it over a day that was never part of it.
  const endsOn = season.parallel && season.endsOn ? season.endsOn : closedOn;

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

  // A parallel season already holds its games by date. Stamping it on them would take
  // them from the regular season they are waiting to be attached to.
  if (season.parallel) redirect("/admin/seasons");

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
