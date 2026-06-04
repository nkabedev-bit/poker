import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const context = await loadCurrentTournamentContext(auth.supabase);
  const tablesCount = context
    ? Math.max(1, Math.floor(context.extras.settings.tablesCount))
    : 0;

  const player = context?.extras.players.find(
    (item) => item.telegramId === auth.user.telegram_id,
  );

  return NextResponse.json({
    profileSubmitted: Boolean(auth.user.profile_submitted_at),
    tablesCount,
    registered: player
      ? {
          registrationNumber: player.registrationNumber ?? null,
          table: player.table ?? null,
          name: player.name,
        }
      : null,
    stats: {
      games: auth.user.games_played ?? 0,
      eliminations: Number(auth.user.eliminations_count ?? 0),
      top7: auth.user.top7_count ?? 0,
    },
  });
}
