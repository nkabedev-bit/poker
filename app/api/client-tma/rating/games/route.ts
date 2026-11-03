import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import {
  describeNextCountedGame,
  findSeasonLine,
  findSeasonsDueToClose,
  splitCountedGames,
} from "@/lib/seasons/season";
import {
  listSeasons,
  readSeasonLines,
  readSeasonSnapshot,
  type SeasonGameRow,
} from "@/lib/seasons/store";

export const dynamic = "force-dynamic";

function toGame({ place, points, startedAt, title }: SeasonGameRow) {
  return { place, points, startedAt, title };
}

/**
 * One player's games in one season, split into the ones that make up their points and the
 * ones that stay behind. Only what the finishing tables already show the room.
 *
 * A season that exists only as imported totals has no games behind it, and a viewer who
 * has not played in it has none either: both answer with empty lists, not an error.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  const seasonId = params.get("season");
  const key = buildNicknameKey(params.get("player") ?? "");
  if (!seasonId || !key) {
    return NextResponse.json({ error: "Укажите сезон и игрока" }, { status: 400 });
  }

  const season = (await listSeasons(auth.supabase)).find((item) => item.id === seasonId);
  if (!season) return NextResponse.json({ error: "Сезон не найден" }, { status: 404 });

  // A frozen line knows its account, and the nickname on it may be out of date by now.
  const frozen = season.status === "closed" ? await readSeasonSnapshot(auth.supabase, season.id) : [];
  const telegramId = frozen.find((line) => buildNicknameKey(line.playerName) === key)?.telegramId;

  const line = findSeasonLine(await readSeasonLines(auth.supabase, season), { key, telegramId });
  const { counted, dropped } = splitCountedGames(line?.rows ?? [], season.countedGames);
  // A season past its last day waits for noon to close, and no next game will join it.
  const stillPlayed =
    season.status === "open" && findSeasonsDueToClose([season], new Date()).length === 0;

  return NextResponse.json({
    counted: counted.map(toGame),
    countedGames: season.countedGames,
    dropped: dropped.map(toGame),
    next: stillPlayed ? describeNextCountedGame(counted, season.countedGames) : null,
  });
}
