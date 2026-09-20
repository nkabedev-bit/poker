import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readClientLiveState } from "@/lib/client-tma/live-state";
import { requireClientSignedIn } from "@/lib/client-tma/require-signed-in";

export const dynamic = "force-dynamic";

/**
 * The beat behind the "game under way" card.
 *
 * Costs a few hundred bytes: the roster is counted inside the database and the blind
 * grid travels only when the phone asks for it — on the first load, and again when the
 * version it holds no longer matches. The countdown itself runs on the phone, off the
 * level's start time, so this is asked twice a minute rather than once a second.
 */
export async function GET(request: Request) {
  const auth = requireClientSignedIn(request);
  if (auth.error) return auth.error;

  const includeLevels = new URL(request.url).searchParams.get("levels") === "1";

  try {
    const live = await readClientLiveState(createSupabaseAdminClient(), { includeLevels });

    return NextResponse.json({ live }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read the live tournament state", error);
    return NextResponse.json({ error: "Не удалось прочитать статус турнира" }, { status: 500 });
  }
}
