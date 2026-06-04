import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import {
  loadCurrentTournamentContext,
  saveTournamentExtrasFromContext,
} from "@/lib/client-bot/server";

export const dynamic = "force-dynamic";

function trimField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const context = await loadCurrentTournamentContext(auth.supabase);
  if (!context) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  return NextResponse.json(context.extras.clientBot);
}

export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const context = await loadCurrentTournamentContext(auth.supabase);
  if (!context) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json();
  const next = await saveTournamentExtrasFromContext(auth.supabase, context, {
    clientBot: {
      ratingUrl: trimField(body.ratingUrl),
      registrationCode: trimField(body.registrationCode),
      scheduleText: trimField(body.scheduleText),
    },
  });

  return NextResponse.json(next.clientBot);
}
