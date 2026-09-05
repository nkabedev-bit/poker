import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import { getPersistedPlayerLabel } from "@/lib/player-labels";
import { loadPlayerAvatars } from "@/lib/players/avatars";
import { countGamesByNickname } from "@/lib/players/games-played";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { isSameTelegramAccount } from "@/lib/players/same-account";
import { resolvePlayerTier } from "@/lib/players/tier";

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

  // A web player has no Telegram id on the results, so the nickname is what finds them
  // in the finishing table — the same nickname the row was stored under.
  const myNicknameKey = buildNicknameKey(auth.user.display_name ?? "");
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
      isMe:
        isSameTelegramAccount(auth.user.telegram_id, record.telegram_id) ||
        (Boolean(myNicknameKey) && buildNicknameKey(record.player_name) === myNicknameKey),
      knockouts: Number(record.knockouts ?? 0),
      place: record.place,
      playedOn: record.played_on,
      playerName: record.player_name,
      points: Number(record.points ?? 0),
      telegramId: record.telegram_id,
      title: record.title,
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "Игра не найдена" }, { status: 404 });
  }

  // The table wears the same tiers as the board and the rating, so a player is
  // recognisable wherever their name appears.
  const [games, labels, avatars] = await Promise.all([
    countGamesByNickname(auth.supabase, rows.map((row) => row.playerName)),
    loadCurrentTournamentContext(auth.supabase).then((context) => context?.extras.playerLabels),
    loadPlayerAvatars(auth.supabase),
  ]);

  const withTiers = rows.map((row) => ({
    ...row,
    // The finishing table shows faces the size of a fingernail, so thumbnails do.
    avatarUrl: row.isMe
      ? (auth.user.avatar_thumb_url ?? auth.user.avatar_url ?? null)
      : avatars.find({ name: row.playerName, telegramId: row.telegramId }).thumbUrl,
    tier: resolvePlayerTier({
      games: games.get(buildNicknameKey(row.playerName)) ?? 0,
      label: getPersistedPlayerLabel(labels, row.playerName),
    }),
  }));

  return NextResponse.json({
    game: {
      countsForRating: rows[0].countsForRating,
      playedOn: rows[0].playedOn,
      startedAt,
      title: rows[0].title,
    },
    rows: withTiers.map((row) => ({
      avatarUrl: row.avatarUrl,
      isMe: row.isMe,
      knockouts: row.knockouts,
      place: row.place,
      playerName: row.playerName,
      points: row.points,
      tier: row.tier,
    })),
  });
}
