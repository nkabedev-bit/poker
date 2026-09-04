import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import { getPersistedPlayerLabel } from "@/lib/player-labels";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { buildPlayerStats, readPlayerGames } from "@/lib/players/profile";
import { countGamesByNickname } from "@/lib/players/games-played";
import { resolvePlayerTier } from "@/lib/players/tier";

export const dynamic = "force-dynamic";

const GAMES_SHOWN = 40;

/**
 * Another player's profile, as the club shows it to the room: what they have played,
 * what they have won, and the medals and achievements that came out of it.
 *
 * Everything here is already public inside the club — it is on the board in the hall
 * and in the rating table. Nothing personal from the questionnaire is served.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const key = buildNicknameKey(decodeURIComponent((await params).key));
  if (!key) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // The account behind the nickname, when there is one: it carries the avatar and the
  // medals. A player who has only ever been added by hand has neither.
  const { data: account } = await auth.supabase
    .from("client_bot_users")
    .select("telegram_id, display_name, avatar_url, medals")
    .eq("nickname_key", key)
    .maybeSingle();

  const record = account as {
    avatar_url: string | null;
    display_name: string | null;
    medals: Record<string, unknown> | null;
    telegram_id: number;
  } | null;

  // Failing that, the nickname as the results themselves spell it.
  const { data: named } = await auth.supabase
    .from("tournament_results")
    .select("player_name")
    .eq("player_key", key)
    .order("started_at", { ascending: false })
    .limit(1);

  const nickname =
    record?.display_name ??
    (named?.[0] as { player_name?: string } | undefined)?.player_name ??
    "";

  if (!nickname) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const played = await readPlayerGames(auth.supabase, {
    nickname,
    telegramId: record?.telegram_id ?? null,
  });

  if (played.length === 0 && !record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const stats = await buildPlayerStats(auth.supabase, played);
  const [labels, games] = await Promise.all([
    loadCurrentTournamentContext(auth.supabase).then((context) => context?.extras.playerLabels),
    countGamesByNickname(auth.supabase, [nickname]),
  ]);

  return NextResponse.json({
    player: {
      avatarUrl: record?.avatar_url ?? null,
      games: played.slice(0, GAMES_SHOWN).map((game) => ({
        knockouts: game.knockouts,
        place: game.place,
        startedAt: game.startedAt,
      })),
      isMe: record?.telegram_id === auth.user.telegram_id,
      medals: (record?.medals as Record<string, number> | null) ?? {},
      name: nickname,
      stats,
      tier: resolvePlayerTier({
        games: games.get(key) ?? stats.games,
        label: getPersistedPlayerLabel(labels, nickname),
      }),
    },
  });
}
