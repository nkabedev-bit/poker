import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTournamentVersion } from "@/lib/public-state";
import { requireTmaAuth } from "@/lib/tma/require-auth";

export const dynamic = "force-dynamic";

/**
 * The newest change to the sign-ups, with their count for a row taken away, which leaves
 * no stamp. The waiting list and the reserved tickets are sign-ups too, so this covers
 * everything the «Заявки» screen lists.
 */
async function signupsStamp(supabase: SupabaseClient) {
  const { count, data, error } = await supabase
    .from("event_signups")
    .select("updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  return `${count ?? 0}:${(data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? ""}`;
}

/**
 * Whether anything the desk's screens show has changed, as one short fingerprint.
 *
 * The admin screens read the whole tournament every five seconds while they were open —
 * the biggest share of the club's server time on a game night. They ask this instead,
 * every five seconds, and reload only when the answer moves: the tournament (roster,
 * timer, draw, levels) and the sign-ups.
 */
export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  try {
    const [tournament, signups] = await Promise.all([
      loadTournamentVersion(auth.supabase),
      signupsStamp(auth.supabase),
    ]);

    return NextResponse.json(
      { version: `${tournament ?? ""}#${signups}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to read the desk's version", error);
    return NextResponse.json({ error: "Не удалось проверить изменения" }, { status: 500 });
  }
}
