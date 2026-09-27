import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadPlayerAvatars } from "@/lib/players/avatars";
import { loadFavoriteHands } from "@/lib/players/favorite-hand";
import { readPastGames } from "@/lib/results/club-games";
import { buildPlayerResultsFilter } from "@/lib/results/player-stats";

export const dynamic = "force-dynamic";

const GAMES_LIMIT = 60;

/**
 * The club's past games for the tournaments tab: a page at a time, each with its poster,
 * how many played and who won. Only what the finishing table already shows the room.
 */
async function listClubGames(supabase: SupabaseClient, from: string | null) {
  const page = await readPastGames(supabase, { from });

  const eventIds = [...new Set(page.games.map((game) => game.eventId).filter(Boolean))] as string[];
  const [posters, avatars, hands] = await Promise.all([
    eventIds.length > 0
      ? supabase.from("tournament_events").select("id, poster_url").in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    loadPlayerAvatars(supabase),
    loadFavoriteHands(supabase),
  ]);
  // A poster that cannot be read leaves the card plain rather than the list empty.
  const posterById = new Map(
    ((posters.data ?? []) as Array<{ id: string; poster_url: string | null }>).map((event) => [
      event.id,
      event.poster_url,
    ]),
  );

  return NextResponse.json({
    games: page.games.map((game) => ({
      players: game.players,
      posterUrl: (game.eventId && posterById.get(game.eventId)) || null,
      startedAt: game.startedAt,
      title: game.title,
      winner: game.winner
        ? {
            avatarUrl: avatars.find(game.winner).thumbUrl,
            hand: hands.find(game.winner),
            name: game.winner.name,
          }
        : null,
    })),
    next: page.next,
  });
}

/**
 * The games a player has behind them: what the tournament was called, when it ran and
 * where they finished. Matched by account, falling back to the club nickname so games
 * played before they opened the app still count as theirs.
 *
 * With `scope=club` it lists the club's past games instead, a page at a time from the
 * game `from` names.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  if (params.get("scope") === "club") {
    const from = params.get("from");
    if (from && Number.isNaN(Date.parse(from))) {
      return NextResponse.json({ error: "Некорректная игра" }, { status: 400 });
    }
    return listClubGames(auth.supabase, from);
  }

  const { data, error } = await auth.supabase
    .from("tournament_results")
    .select("started_at, played_on, title, place, points, knockouts, counts_for_rating")
    .or(buildPlayerResultsFilter(auth.user.telegram_id, auth.user.display_name ?? ""))
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
