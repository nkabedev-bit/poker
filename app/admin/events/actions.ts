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
import {
  makeEventTemplate,
  removeEventTemplate,
  upsertEventTemplate,
} from "@/lib/events/templates";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  notifyReservedOnPublish,
  releaseReservation,
  reserveTicket,
} from "@/lib/events/reservations";
import { isReservableTicket } from "@/lib/events/types";

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

/**
 * Sends the admin back with something to read.
 *
 * Every way this form could fail used to throw, and the page it throws on has nothing
 * to show for it: the poster simply did not appear and nobody was told why.
 */
function backWithError(message: string): never {
  redirect(`/admin/events?error=${encodeURIComponent(message)}`);
}

export async function saveTournamentEvent(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const parsed = eventInputSchema.safeParse({
    badge: formData.get("badge"),
    buyIn: formData.get("buyIn") || 0,
    duoBuyIn: optionalNumber(formData.get("duoBuyIn")),
    featuresText: formData.get("featuresText"),
    isPublished: formData.get("isPublished") === "yes",
    lateEntryUntil: formData.get("lateEntryUntil"),
    maxDuoTickets: optionalNumber(formData.get("maxDuoTickets")),
    maxPlayers: optionalNumber(formData.get("maxPlayers")),
    maxVipPlayers: optionalNumber(formData.get("maxVipPlayers")),
    posterUrl: formData.get("posterUrl"),
    rulesText: formData.get("rulesText"),
    startingStack: optionalNumber(formData.get("startingStack")),
    startsAt: formData.get("startsAt"),
    title: formData.get("title"),
    venueAddress: formData.get("venueAddress"),
    vipBuyIn: optionalNumber(formData.get("vipBuyIn")),
  });

  if (!parsed.success) {
    backWithError(parsed.error.issues[0]?.message ?? "Проверьте поля афиши");
  }

  // The redirects stay outside the catch: `redirect` works by throwing, and swallowing
  // it here would turn a saved poster into a silent failure of its own.
  let failure: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const posterUrl = (await uploadPosterFile(supabase, formData)) ?? parsed.data.posterUrl;

    const saved = await saveEvent(supabase, {
      ...toEventDraft({ ...parsed.data, posterUrl }),
      ...(id ? { id } : {}),
    });

    // The poster going up is when a held ticket is announced, and only once — the
    // reservation itself remembers whether its player has been told.
    if (saved.isPublished) await notifyReservedOnPublish(supabase, saved.id);
  } catch (error) {
    console.error("Could not save the event", error);
    failure =
      error instanceof PosterUploadError
        ? error.message
        : "Не удалось сохранить афишу. Попробуйте ещё раз.";
  }

  if (failure) backWithError(failure);

  revalidatePath("/admin/events");
  redirect("/admin/events?saved=1");
}

/**
 * Puts a poster in front of the players, or takes it back.
 *
 * The switch lives inside the poster's own form as well, but a club that lays out a
 * week of tournaments at once publishes them one after another — and opening each one
 * to flip a single field is the slow way round.
 */
export async function toggleTournamentEventPublished(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) backWithError("Афиша не выбрана");

  const publish = formData.get("publish") === "yes";
  let failure: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("tournament_events")
      .update({ is_published: publish })
      .eq("id", id);

    if (error) throw error;
    if (publish) await notifyReservedOnPublish(supabase, id);
  } catch (error) {
    console.error("Could not change what the poster shows", error);
    failure = publish ? "Не удалось опубликовать афишу." : "Не удалось снять афишу.";
  }

  if (failure) backWithError(failure);

  revalidatePath("/admin/events");
  redirect(`/admin/events?saved=${encodeURIComponent(publish ? "Афиша опубликована" : "Афиша снята с публикации")}`);
}

/** Holds a ticket for a resident who asked ahead. */
export async function reserveEventTicket(formData: FormData) {
  const eventId = String(formData.get("id") ?? "").trim();
  if (!eventId) backWithError("Сначала сохраните афишу");

  const nickname = String(formData.get("reservedNickname") ?? "").trim();
  if (!nickname) backWithError("Впишите ник резидента");

  const requested = formData.get("reservedTicket");
  const supabase = await createSupabaseServerClient();
  const outcome = await reserveTicket(supabase, {
    eventId,
    nickname,
    ticketType: isReservableTicket(requested) ? requested : "regular",
  });

  if (outcome.error === "ambiguous") backWithError("Этот ник носят несколько игроков — уточните");
  if (outcome.error === "not_found") backWithError("Не нашли резидента с таким ником");
  if (outcome.error === "taken") backWithError("Игрок уже записался на этот турнир сам");

  revalidatePath("/admin/events");
  redirect(`/admin/events?saved=${encodeURIComponent(`Билет отложен для ${nickname}`)}`);
}

/** Takes a held ticket back, freeing the seat it was keeping. */
export async function releaseEventTicket(formData: FormData) {
  const eventId = String(formData.get("id") ?? "").trim();
  const id = String(formData.get("reservationId") ?? "").trim();
  if (!eventId || !id) backWithError("Билет не выбран");

  const supabase = await createSupabaseServerClient();
  await releaseReservation(supabase, { eventId, id });

  revalidatePath("/admin/events");
  redirect("/admin/events?saved=Отложенный билет снят");
}

export async function deleteTournamentEvent(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createSupabaseServerClient();

  await deleteEvent(supabase, id);

  revalidatePath("/admin/events");
  redirect("/admin/events?saved=Афиша удалена");
}

/**
 * Saves the poster on screen as a template. The club runs the same seven tournaments,
 * so what is worth keeping is everything except the evening — that is typed afresh.
 */
export async function saveTournamentEventTemplate(formData: FormData) {
  const name = String(formData.get("templateName") ?? "").trim();
  if (!name) backWithError("Дайте шаблону название");

  const parsed = eventInputSchema.safeParse({
    badge: formData.get("badge"),
    buyIn: formData.get("buyIn") || 0,
    duoBuyIn: optionalNumber(formData.get("duoBuyIn")),
    featuresText: formData.get("featuresText"),
    isPublished: false,
    lateEntryUntil: formData.get("lateEntryUntil"),
    maxDuoTickets: optionalNumber(formData.get("maxDuoTickets")),
    maxPlayers: optionalNumber(formData.get("maxPlayers")),
    maxVipPlayers: optionalNumber(formData.get("maxVipPlayers")),
    posterUrl: formData.get("posterUrl"),
    rulesText: formData.get("rulesText"),
    startingStack: optionalNumber(formData.get("startingStack")),
    startsAt: formData.get("startsAt"),
    title: formData.get("title"),
    venueAddress: formData.get("venueAddress"),
    vipBuyIn: optionalNumber(formData.get("vipBuyIn")),
  });

  if (!parsed.success) {
    backWithError(parsed.error.issues[0]?.message ?? "Проверьте поля афиши");
  }

  let failure: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    // A picture picked in the form but not yet saved is uploaded here, so the template
    // keeps the artwork every poster of the club shares.
    const posterUrl = (await uploadPosterFile(supabase, formData)) ?? parsed.data.posterUrl;
    const { data: tournament } = await supabase.from("tournaments").select("id").limit(1).single();
    const extras = await loadTournamentExtras(tournament?.id as string | undefined, supabase);

    await saveTournamentExtras(
      {
        eventTemplates: upsertEventTemplate(
          extras.eventTemplates,
          makeEventTemplate(name, toEventDraft({ ...parsed.data, posterUrl })),
        ),
      },
      "/admin/events",
      supabase,
    );
  } catch (error) {
    console.error("Could not save the event template", error);
    failure =
      error instanceof PosterUploadError
        ? error.message
        : "Не удалось сохранить шаблон. Попробуйте ещё раз.";
  }

  if (failure) backWithError(failure);

  revalidatePath("/admin/events");
  redirect("/admin/events?saved=Шаблон сохранён");
}

export async function deleteTournamentEventTemplate(formData: FormData) {
  const id = String(formData.get("templateId") ?? "").trim();

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase.from("tournaments").select("id").limit(1).single();
  const extras = await loadTournamentExtras(tournament?.id as string | undefined, supabase);

  await saveTournamentExtras(
    { eventTemplates: removeEventTemplate(extras.eventTemplates, id) },
    "/admin/events",
    supabase,
  );

  revalidatePath("/admin/events");
  redirect("/admin/events?saved=Шаблон удалён");
}
