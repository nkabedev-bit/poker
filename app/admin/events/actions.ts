"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareLogoImage } from "@/lib/admin/logo-upload";
import { eventInputSchema, toEventDraft } from "@/lib/events/input";
import { MAX_POSTER_BYTES, PosterUploadError } from "@/lib/events/poster-upload";
import { deleteEvent, saveEvent } from "@/lib/events/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const POSTER_BUCKET = "tournament-logos";

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

// The web form posts the file itself; the mini-app sends a data URL instead
// (lib/events/poster-upload).
async function uploadPosterFile(supabase: SupabaseClient, formData: FormData) {
  const file = formData.get("poster");
  if (!(file instanceof File) || file.size === 0) return null;

  if (file.size > MAX_POSTER_BYTES) {
    throw new PosterUploadError("Афиша больше 5 МБ — уменьшите файл");
  }

  const bytes = await prepareLogoImage(Buffer.from(await file.arrayBuffer()));
  const path = `events/${randomUUID()}.png`;

  const { error } = await supabase.storage
    .from(POSTER_BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });

  if (error) throw error;

  return supabase.storage.from(POSTER_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function saveTournamentEvent(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const parsed = eventInputSchema.parse({
    badge: formData.get("badge"),
    buyIn: formData.get("buyIn") || 0,
    featuresText: formData.get("featuresText"),
    isPublished: formData.get("isPublished") === "yes",
    lateEntryUntil: formData.get("lateEntryUntil"),
    maxPlayers: optionalNumber(formData.get("maxPlayers")),
    posterUrl: formData.get("posterUrl"),
    rulesText: formData.get("rulesText"),
    startingStack: optionalNumber(formData.get("startingStack")),
    startsAt: formData.get("startsAt"),
    title: formData.get("title"),
    venueAddress: formData.get("venueAddress"),
  });

  const supabase = await createSupabaseServerClient();
  const posterUrl = (await uploadPosterFile(supabase, formData)) ?? parsed.posterUrl;

  await saveEvent(supabase, {
    ...toEventDraft({ ...parsed, posterUrl }),
    ...(id ? { id } : {}),
  });

  revalidatePath("/admin/events");
  redirect("/admin/events?saved=1");
}

export async function deleteTournamentEvent(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createSupabaseServerClient();

  await deleteEvent(supabase, id);

  revalidatePath("/admin/events");
  redirect("/admin/events?deleted=1");
}
