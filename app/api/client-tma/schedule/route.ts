import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const context = await loadCurrentTournamentContext(auth.supabase);

  return NextResponse.json({
    scheduleText: context?.extras.clientBot.scheduleText?.trim() ?? "",
    ratingUrl: context?.extras.clientBot.ratingUrl?.trim() ?? "",
  });
}
