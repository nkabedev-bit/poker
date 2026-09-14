import { after, NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { countActiveSignups, listEvents, saveEvent } from "@/lib/events/store";
import {
  eventInputSchema,
  EventInputError,
  readPublishAt,
  toEventDraft,
} from "@/lib/events/input";
import { PosterUploadError, uploadEventPosterDataUrl } from "@/lib/events/poster-upload";
import {
  announcePublishedEvents,
  loadPublishTimes,
  publishDueEvents,
  savePublishAt,
} from "@/lib/events/scheduled-publication";
import { keepLatestPastEvent } from "@/lib/events/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const now = new Date();
  // A draft whose time has come is put up before the list is read, so the desk sees it
  // published; the messages about held tickets go out after the answer.
  const justPublished = await publishDueEvents(auth.supabase, now);
  if (justPublished.length > 0) {
    after(() => announcePublishedEvents(auth.supabase, justPublished));
  }

  // Of the games already played only the last one stays on the desk's list.
  const events = keepLatestPastEvent(await listEvents(auth.supabase), now);
  const eventIds = events.map((event) => event.id);
  const [signupCounts, publishTimes] = await Promise.all([
    countActiveSignups(auth.supabase, eventIds),
    loadPublishTimes(auth.supabase, eventIds),
  ]);

  return NextResponse.json({
    events: events.map((event) => ({
      ...event,
      publishAt: publishTimes.get(event.id) ?? null,
      signupsCount: signupCounts.get(event.id)?.total ?? 0,
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
    // Read before the poster is written, so a time already gone saves nothing.
    const publishAt = readPublishAt(parsed.data);
    const posterUrl = body.posterDataUrl
      ? await uploadEventPosterDataUrl(auth.supabase, String(body.posterDataUrl))
      : parsed.data.posterUrl;

    const event = await saveEvent(auth.supabase, toEventDraft({ ...parsed.data, posterUrl }));
    if (publishAt) await savePublishAt(auth.supabase, event.id, publishAt);

    return NextResponse.json({ event: { ...event, publishAt } });
  } catch (error) {
    if (error instanceof EventInputError || error instanceof PosterUploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
