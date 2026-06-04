import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const { data: timerState } = await auth.supabase
    .from("timer_state")
    .select("*")
    .eq("tournament_id", t.id)
    .single();

  const { searchParams } = new URL(request.url);
  if (searchParams.get("scope") === "control") {
    return NextResponse.json({ timerState });
  }

  const { data: blindLevels } = await auth.supabase
    .from("blind_levels")
    .select("*")
    .eq("tournament_id", t.id)
    .order("level_order");

  return NextResponse.json({ timerState, blindLevels });
}
