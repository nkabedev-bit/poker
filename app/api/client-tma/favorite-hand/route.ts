import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import { getPersistedPlayerLabel } from "@/lib/player-labels";
import { formatFavoriteHand, parseFavoriteHand } from "@/lib/players/favorite-hand";
import { readPlayerGames } from "@/lib/players/profile";
import { resolvePlayerTier, TIER_GAMES } from "@/lib/players/tier";

export const dynamic = "force-dynamic";

/**
 * Sets the two cards a player calls their own, or takes them off with `hand: null`.
 *
 * A hand is for members of the club: the tier is counted here the way the profile
 * counts it — every game behind the player, the club's own label over the count — so a
 * screen that shows the picker by mistake still cannot hand one out.
 */
export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const requested = (body as { hand?: unknown } | null)?.hand;

  let hand: string | null = null;
  if (requested !== null) {
    const cards = parseFavoriteHand(requested);
    if (!cards) {
      return NextResponse.json(
        { error: "invalid_hand", message: "Выберите две разные карты." },
        { status: 400 },
      );
    }

    const [context, played] = await Promise.all([
      loadCurrentTournamentContext(auth.supabase),
      readPlayerGames(auth.supabase, {
        nickname: auth.user.display_name ?? "",
        telegramId: auth.user.telegram_id,
      }),
    ]);
    const tier = resolvePlayerTier({
      games: played.length,
      label: getPersistedPlayerLabel(context?.extras.playerLabels, auth.user.display_name),
    });

    if (!tier) {
      return NextResponse.json(
        {
          error: "tier_required",
          message: `Любимая рука откроется со статуса MEMBER — это ${TIER_GAMES.member} игр в клубе.`,
        },
        { status: 403 },
      );
    }

    hand = formatFavoriteHand(cards);
  }

  const { error } = await auth.supabase
    .from("client_bot_users")
    .update({ favorite_hand: hand })
    .eq("id", auth.user.id);

  if (error) {
    // The column comes with a migration applied by hand.
    if (String(error.message ?? "").includes("favorite_hand")) {
      return NextResponse.json(
        {
          error: "not_ready",
          message: "Любимая рука ещё не включена в клубе. Попробуйте позже.",
        },
        { status: 503 },
      );
    }
    throw error;
  }

  return NextResponse.json({ hand });
}
