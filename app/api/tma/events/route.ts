import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { countActiveSignups, listEvents, saveEvent } from "@/lib/events/store";
import { eventInputSchema, EventInputError, toEventDraft } from "@/lib/events/input";
import { PosterUploadError, uploadEventPosterDataUrl } from "@/lib/events/poster-upload";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const events = await listEvents(auth.supabase);
  const signupCounts = await countActiveSignups(
    auth.supabase,
    events.map((event) => event.id),
  );

  return NextResponse.json({
    events: events.map((event) => ({
      ...event,
      signupsCount: signupCounts.get(event.id) ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
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

    const event = await saveEvent(auth.supabase, toEventDraft({ ...parsed.data, posterUrl }));

    return NextResponse.json({ event });
  } catch (error) {
    if (error instanceof EventInputError || error instanceof PosterUploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
