import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import { isRegistrationCodeMatch } from "@/lib/client-bot/registration";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  if (!auth.user.profile_submitted_at) {
    return NextResponse.json(
      { error: "profile_required", message: "Сначала заполните анкету в боте." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";

  const context = await loadCurrentTournamentContext(auth.supabase);
  if (!context) {
    return NextResponse.json(
      { error: "no_tournament", message: "Турнир пока не настроен." },
      { status: 404 },
    );
  }

  const valid = isRegistrationCodeMatch(code, context.extras.clientBot.registrationCode);

  return NextResponse.json({ valid });
}
