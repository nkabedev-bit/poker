import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { broadcastPublicState } from "@/lib/realtime/broadcast";

type BlindDurationPatch = {
  id?: unknown;
  duration_seconds?: unknown;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function PATCH(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  try {
    const { data: t } = await auth.supabase.from("tournaments").select("id, public_token").limit(1).single();
    if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

    const body: unknown = await request.json(); // Array of { id, duration_seconds }
    if (!Array.isArray(body)) return NextResponse.json({ error: "Expected array" }, { status: 400 });

    for (const level of body as BlindDurationPatch[]) {
      if (typeof level.id === "string" && typeof level.duration_seconds === "number") {
        await auth.supabase
          .from("blind_levels")
          .update({ duration_seconds: level.duration_seconds })
          .eq("id", level.id)
          .eq("tournament_id", t.id);
      }
    }

    await broadcastPublicState(t.public_token);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
