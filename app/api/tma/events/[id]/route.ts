import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { deleteEvent, getEvent, saveEvent } from "@/lib/events/store";
import {
  eventInputSchema,
  EventInputError,
  readPublishAt,
  toEventDraft,
} from "@/lib/events/input";
import { PosterUploadError, uploadEventPosterDataUrl } from "@/lib/events/poster-upload";
import { notifyReservedOnPublish } from "@/lib/events/reservations";
import { savePublishAt } from "@/lib/events/scheduled-publication";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const id = (await params).id;
  const existing = await getEvent(auth.supabase, id);
  if (!existing) return NextResponse.json({ error: "Афиша не найдена" }, { status: 404 });

  const body = await request.json().catch(() => ({}));

  // A publish toggle sends nothing but the flag, so the stored event fills in the rest.
  if (Object.keys(body).length === 1 && typeof body.isPublished === "boolean") {
    const event = await saveEvent(auth.supabase, { ...existing, isPublished: body.isPublished });

    // The poster going up is when a held ticket is announced. A time it was waiting for
    // no longer applies once the admin has put it up by hand.
    if (body.isPublished) {
      await savePublishAt(auth.supabase, event.id, null);
      await notifyReservedOnPublish(auth.supabase, event.id);
    }
    return NextResponse.json({ event });
  }

  const parsed = eventInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Проверьте поля афиши" },
      { status: 400 },
    );
  }

  try {
    // Read before anything is written: a publication time already gone must not leave
    // the rest of the poster saved behind the admin's back.
    const publishAt = readPublishAt(parsed.data);
    const posterUrl = body.posterDataUrl
      ? await uploadEventPosterDataUrl(auth.supabase, String(body.posterDataUrl))
      : parsed.data.posterUrl;

    const event = await saveEvent(auth.supabase, {
      ...toEventDraft({ ...parsed.data, posterUrl }),
      id,
    });

    // A draft waits for its time; a poster that is up has nothing left to wait for.
    await savePublishAt(auth.supabase, event.id, publishAt);

    // Saving a poster that was a draft is the same moment as publishing one.
    if (event.isPublished && !existing.isPublished) {
      await notifyReservedOnPublish(auth.supabase, event.id);
    }

    return NextResponse.json({ event: { ...event, publishAt } });
  } catch (error) {
    if (error instanceof EventInputError || error instanceof PosterUploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  await deleteEvent(auth.supabase, (await params).id);

  return new NextResponse(null, { status: 204 });
}
