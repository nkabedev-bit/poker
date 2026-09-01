import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";

export const dynamic = "force-dynamic";

const GAMES_LIMIT = 60;

/**
 * The games a player has behind them: what the tournament was called, when it ran and
 * where they finished. Matched by account, falling back to the club nickname so games
 * played before they opened the app still count as theirs.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const nickname = auth.user.display_name?.trim() ?? "";
  const filters = [`telegram_id.eq.${auth.user.telegram_id}`];
  if (nickname) filters.push(`player_name.ilike.${nickname.replace(/[\\%_]/g, "\\$&")}`);

  const { data, error } = await auth.supabase
    .from("tournament_results")
    .select("started_at, played_on, title, place, points, knockouts, counts_for_rating")
    .or(filters.join(","))
    .order("started_at", { ascending: false })
    .limit(GAMES_LIMIT);

  if (error) throw error;

  return NextResponse.json({
    games: (data ?? []).map((row) => {
      const record = row as {
        counts_for_rating: boolean | null;
        knockouts: number | string | null;
        place: number | null;
        played_on: string;
        points: number | string | null;
        started_at: string;
        title: string;
      };

      return {
        countsForRating: record.counts_for_rating !== false,
        knockouts: Number(record.knockouts ?? 0),
        place: record.place,
        playedOn: record.played_on,
        points: Number(record.points ?? 0),
        startedAt: record.started_at,
        title: record.title,
      };
    }),
  });
}
