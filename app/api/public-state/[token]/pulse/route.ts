import { NextResponse } from "next/server";
import { hasPublicEnv } from "@/lib/env";
import { loadPublicStateVersion } from "@/lib/public-state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Whether anything on a screen has changed, as one short fingerprint.
 *
 * The screen in the hall hears about changes over a realtime channel on supabase.co,
 * which Russian ISPs cut through Cloudflare, so a draw could wait for the 45-second
 * poll. While a tournament is under way the screen asks this instead, every ten
 * seconds, from the club's own domain, and fetches the whole state only when the
 * answer moves.
 */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!hasPublicEnv()) {
    return NextResponse.json({ error: "Public screen not found" }, { status: 404 });
  }

  try {
    const version = await loadPublicStateVersion(createSupabaseAdminClient(), token);

    if (!version) {
      return NextResponse.json({ error: "Public screen not found" }, { status: 404 });
    }

    return NextResponse.json({ version }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read the screen's version", error);
    return NextResponse.json({ error: "Unable to read the screen's version" }, { status: 500 });
  }
}
