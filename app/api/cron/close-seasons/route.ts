import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { findSeasonsDueToClose } from "@/lib/seasons/season";
import { freezeAndCloseSeason, listSeasons } from "@/lib/seasons/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Closes the seasons whose last day has passed, exactly as the admin's «Закрыть» does:
 * the table is frozen and the season keeps its own end date. pg_cron calls at 12:00
 * Moscow time, and only when such a season exists (202610090002).
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
  const due = findSeasonsDueToClose(await listSeasons(supabase), new Date());

  const closed: string[] = [];
  const failed: string[] = [];

  // One season that cannot be frozen stays open for the admin and does not hold up the rest.
  for (const season of due) {
    try {
      await freezeAndCloseSeason(supabase, season, season.endsOn);
      closed.push(season.title);
    } catch (error) {
      console.error("Failed to close a season past its last day", { error, season: season.title });
      failed.push(season.title);
    }
  }

  return NextResponse.json({ closed, failed }, { status: failed.length > 0 ? 500 : 200 });
}
