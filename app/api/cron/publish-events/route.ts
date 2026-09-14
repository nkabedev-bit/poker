import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { announcePublishedEvents, publishDueEvents } from "@/lib/events/scheduled-publication";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Puts up the drafts whose publication time has come.
 *
 * pg_cron looks every five minutes, inside the job that already dispatches the scheduled
 * broadcasts, and calls this only when a draft is actually due — one request per poster,
 * not one per tick. The same drafts are put up by the list of posters too, if somebody
 * opens it first; either way a poster goes up, and its tickets are announced, once.
 */
export async function POST(request: Request) {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json({ error: "Server env not configured" }, { status: 503 });
  }

  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const published = await publishDueEvents(supabase);
  await announcePublishedEvents(supabase, published);

  return NextResponse.json({ published: published.length });
}
