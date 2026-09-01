import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { deleteEvent, getEvent, saveEvent } from "@/lib/events/store";
import { eventInputSchema, EventInputError, toEventDraft } from "@/lib/events/input";
import { PosterUploadError, uploadEventPosterDataUrl } from "@/lib/events/poster-upload";

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
    const posterUrl = body.posterDataUrl
      ? await uploadEventPosterDataUrl(auth.supabase, String(body.posterDataUrl))
      : parsed.data.posterUrl;

    const event = await saveEvent(auth.supabase, {
      ...toEventDraft({ ...parsed.data, posterUrl }),
      id,
    });

    return NextResponse.json({ event });
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
