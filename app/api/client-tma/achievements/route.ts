import { NextResponse } from "next/server";
import { requireClientSignedIn } from "@/lib/client-tma/require-signed-in";
import { readClubAchievements } from "@/lib/players/achievement-holders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * How rare each achievement is: how many of the club's players hold it, out of everyone
 * who has played at least one game.
 *
 * The answer is the same for every player, so nobody's account is read to give it.
 */
export async function GET(request: Request) {
  const auth = requireClientSignedIn(request);
  if (auth.error) return auth.error;

  try {
    const club = await readClubAchievements(createSupabaseAdminClient());

    return NextResponse.json({
      holders: Object.fromEntries(
        Object.entries(club.holders).map(([id, holders]) => [id, holders.length]),
      ),
      players: club.players,
    });
  } catch (error) {
    console.error("Failed to count the club's achievements", error);
    return NextResponse.json({ error: "Не удалось посчитать редкость достижений" }, { status: 500 });
  }
}
