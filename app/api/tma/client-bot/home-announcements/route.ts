import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { parseHomeAnnouncementsInput } from "@/lib/client/home-announcements";
import {
  listHomeAnnouncements,
  replaceHomeAnnouncements,
} from "@/lib/client/home-announcements-store";

export const dynamic = "force-dynamic";

// The carousel on the players' home screen, kept by the floor next to the broadcasts.
export async function GET(request: Request) {
  const auth = await requireTmaAuth(request, { floorOnly: true });
  if (auth.error) return auth.error;

  const result = await listHomeAnnouncements(auth.supabase);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 503 });

  return NextResponse.json({ items: result.items });
}

// The desk saves the whole list at once, in the order the carousel shows it.
export async function PUT(request: Request) {
  const auth = await requireTmaAuth(request, { floorOnly: true });
  if (auth.error) return auth.error;

  const parsed = parseHomeAnnouncementsInput(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await replaceHomeAnnouncements(auth.supabase, parsed.items);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 503 });

  return NextResponse.json({ items: result.items });
}
