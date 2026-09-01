"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prepareLogoImage } from "@/lib/admin/logo-upload";
import { moscowLocalToUtcISO } from "@/lib/client-bot/schedule-time";
import { deleteEvent, saveEvent } from "@/lib/events/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const POSTER_BUCKET = "tournament-logos";
const MAX_POSTER_FILE_SIZE = 5 * 1024 * 1024;

const eventSchema = z.object({
  badge: z.string().trim().max(40).optional().default(""),
  buyIn: z.coerce.number().int().min(0).default(0),
  featuresText: z.string().trim().max(4000).optional().default(""),
  id: z.string().uuid().optional(),
  isPublished: z.enum(["yes", "no"]).default("no"),
  lateEntryUntil: z.string().trim().optional().default(""),
  maxPlayers: z.string().trim().optional().default(""),
  posterUrl: z.string().trim().url().or(z.literal("")).optional().default(""),
  rulesText: z.string().trim().max(2000).optional().default(""),
  startingStack: z.string().trim().optional().default(""),
  startsAt: z.string().trim().min(1, "Укажите дату и время"),
  title: z.string().trim().min(1, "Укажите название").max(80),
  venueAddress: z.string().trim().max(200).optional().default(""),
});

function parseOptionalPositiveInt(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function uploadPoster(formData: FormData) {
  const file = formData.get("poster");
  if (!(file instanceof File) || file.size === 0) return null;

  if (file.size > MAX_POSTER_FILE_SIZE) {
    throw new Error("Афиша больше 5 МБ — уменьшите файл");
  }

  const supabase = await createSupabaseServerClient();
  const bytes = await prepareLogoImage(Buffer.from(await file.arrayBuffer()));
  const path = `events/${randomUUID()}.png`;

  const { error } = await supabase.storage
    .from(POSTER_BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });

  if (error) throw error;

  return supabase.storage.from(POSTER_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function saveTournamentEvent(formData: FormData) {
  const parsed = eventSchema.parse({
    badge: formData.get("badge"),
    buyIn: formData.get("buyIn"),
    featuresText: formData.get("featuresText"),
    id: formData.get("id") || undefined,
    isPublished: formData.get("isPublished") === "yes" ? "yes" : "no",
    lateEntryUntil: formData.get("lateEntryUntil"),
    maxPlayers: formData.get("maxPlayers"),
    posterUrl: formData.get("posterUrl"),
    rulesText: formData.get("rulesText"),
    startingStack: formData.get("startingStack"),
    startsAt: formData.get("startsAt"),
    title: formData.get("title"),
    venueAddress: formData.get("venueAddress"),
  });

  const startsAt = moscowLocalToUtcISO(parsed.startsAt);
  const lateEntryUntil = parsed.lateEntryUntil
    ? moscowLocalToUtcISO(parsed.lateEntryUntil)
    : null;

  if (lateEntryUntil && new Date(lateEntryUntil) < new Date(startsAt)) {
    throw new Error("Поздняя регистрация не может закрываться раньше начала турнира");
  }

  const uploadedPosterUrl = await uploadPoster(formData);
  const supabase = await createSupabaseServerClient();

  await saveEvent(supabase, {
    badge: parsed.badge || null,
    buyIn: parsed.buyIn,
    featuresText: parsed.featuresText,
    id: parsed.id,
    isPublished: parsed.isPublished === "yes",
    lateEntryUntil,
    maxPlayers: parseOptionalPositiveInt(parsed.maxPlayers),
    posterUrl: uploadedPosterUrl ?? (parsed.posterUrl || null),
    rulesText: parsed.rulesText,
    startingStack: parseOptionalPositiveInt(parsed.startingStack),
    startsAt,
    title: parsed.title,
    venueAddress: parsed.venueAddress,
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
