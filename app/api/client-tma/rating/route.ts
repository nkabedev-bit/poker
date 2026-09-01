import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";

export const dynamic = "force-dynamic";

const RATING_LIMIT = 200;

/**
 * The club standings. Knockouts and games come from the stats the bot accumulates
 * after every finished tournament; the rating points themselves still live in the
 * club's own Google Sheet, so they are reported as null until that is wired up and
 * the screen says so rather than inventing a number.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("client_bot_users")
    .select("telegram_id, display_name, username, avatar_url, games_played, eliminations_count, top7_count")
    .not("display_name", "is", null)
    .gt("games_played", 0)
    .order("eliminations_count", { ascending: false })
    .limit(RATING_LIMIT);

  if (error) throw error;

  const players = (data ?? []).map((row, index) => {
    const record = row as {
      avatar_url: string | null;
      display_name: string | null;
      eliminations_count: number | string | null;
      games_played: number | null;
      telegram_id: number;
      top7_count: number | null;
    };

    return {
      avatarUrl: record.avatar_url,
      eliminations: Math.round(Number(record.eliminations_count ?? 0)),
      games: Number(record.games_played ?? 0),
      isMe: record.telegram_id === auth.user.telegram_id,
      name: record.display_name ?? "",
      place: index + 1,
      points: null as number | null,
      top9: Number(record.top7_count ?? 0),
    };
  });

  const me = players.find((player) => player.isMe) ?? {
    avatarUrl: auth.user.avatar_url ?? null,
    eliminations: 0,
    games: 0,
    isMe: true,
    name: auth.user.display_name ?? "",
    place: null,
    points: null,
    top9: 0,
  };

  return NextResponse.json({ me, players, pointsAvailable: false });
}
