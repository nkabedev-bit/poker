import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";

export const dynamic = "force-dynamic";

/** Records that the player has read the club's rules: «С правилами ознакомлен». */
export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const acceptedAt = new Date().toISOString();
  const { error } = await auth.supabase
    .from("client_bot_users")
    .update({ rules_accepted_at: acceptedAt })
    .eq("id", auth.user.id);

  if (error) {
    // The column comes with a migration applied by hand.
    if (String(error.message ?? "").includes("rules_accepted_at")) {
      return NextResponse.json(
        { error: "not_ready", message: "Согласие с правилами ещё не включено в клубе. Попробуйте позже." },
        { status: 503 },
      );
    }
    throw error;
  }

  return NextResponse.json({ acceptedAt });
}
