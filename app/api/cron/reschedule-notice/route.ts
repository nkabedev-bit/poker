import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { findRescheduleNotice } from "@/lib/events/reschedule-notice";
import { sendRescheduleNotice } from "@/lib/events/reschedule-answers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Asks everybody holding a seat at a moved game whether they can still come.
 *
 * Started by hand, once, from the server: body `{ "eventId": "...", "send": true }`.
 * Without `send` it is a dry run that only lists who would be asked — the question goes
 * out to real players and cannot be taken back, so the list is read first.
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

  const body = (await request.json().catch(() => ({}))) as { eventId?: unknown; send?: unknown };
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!findRescheduleNotice(eventId)) {
    return NextResponse.json({ error: "No reschedule notice is set for this event" }, { status: 404 });
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const report = await sendRescheduleNotice(supabase, eventId, { dryRun: body.send !== true });

  return NextResponse.json({ dryRun: body.send !== true, ...report });
}
