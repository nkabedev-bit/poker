import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";

export const dynamic = "force-dynamic";

/** The full finishing table of one past game: every place, points and knockouts. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ startedAt: string }> },
) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const startedAt = decodeURIComponent((await params).startedAt);
  if (Number.isNaN(Date.parse(startedAt))) {
    return NextResponse.json({ error: "Некорректная игра" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("tournament_results")
    .select("telegram_id, player_name, place, points, knockouts, title, played_on, counts_for_rating")
    .eq("started_at", startedAt)
    .order("place");

  if (error) throw error;

  const rows = (data ?? []).map((row) => {
    const record = row as {
      counts_for_rating: boolean | null;
      knockouts: number | string | null;
      place: number | null;
      played_on: string;
      player_name: string;
      points: number | string | null;
      telegram_id: number | null;
      title: string;
    };

    return {
      countsForRating: record.counts_for_rating !== false,
      isMe: record.telegram_id === auth.user.telegram_id,
      knockouts: Number(record.knockouts ?? 0),
      place: record.place,
      playedOn: record.played_on,
      playerName: record.player_name,
      points: Number(record.points ?? 0),
      title: record.title,
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "Игра не найдена" }, { status: 404 });
  }

  return NextResponse.json({
    game: {
      countsForRating: rows[0].countsForRating,
      playedOn: rows[0].playedOn,
      startedAt,
      title: rows[0].title,
    },
    rows: rows.map((row) => ({
      isMe: row.isMe,
      knockouts: row.knockouts,
      place: row.place,
      playerName: row.playerName,
      points: row.points,
    })),
  });
}
