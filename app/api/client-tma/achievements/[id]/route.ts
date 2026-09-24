import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { findAchievement } from "@/lib/client/achievements";
import { readClubAchievements } from "@/lib/players/achievement-holders";

export const dynamic = "force-dynamic";

/**
 * Everyone in the club who holds one achievement, the furthest along first.
 *
 * Names, faces and counts are what the rating and any player's profile already show the
 * room. Accounts stay on the server: the phone only learns which line is its own.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!findAchievement(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const club = await readClubAchievements(auth.supabase);

    return NextResponse.json({
      holders: (club.holders[id] ?? []).map((holder) => ({
        avatarUrl: holder.avatarUrl,
        isMe: holder.accountId === auth.user.id,
        key: holder.key,
        name: holder.name,
        value: holder.value,
      })),
      players: club.players,
    });
  } catch (error) {
    console.error("Failed to list an achievement's holders", { error, id });
    return NextResponse.json({ error: "Не удалось загрузить список игроков" }, { status: 500 });
  }
}
