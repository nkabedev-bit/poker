import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import {
  computeSeasonStandings,
  listSeasons,
  readSeasonSnapshot,
} from "@/lib/seasons/store";
import type { SeasonStanding } from "@/lib/seasons/season";

export const dynamic = "force-dynamic";

function normalizeNickname(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

/**
 * The club standings for one season.
 *
 * A closed season is served from the table it was frozen with — that is what the club
 * announced, and correcting an old game must not quietly move it. An open season is
 * computed live from the games stamped with it, under that season's own scoring rule.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const seasons = await listSeasons(auth.supabase);

  if (seasons.length === 0) {
    return NextResponse.json({
      me: null,
      players: [],
      season: null,
      seasons: [],
    });
  }

  const requested = new URL(request.url).searchParams.get("season");
  const season = seasons.find((item) => item.id === requested) ?? seasons[0];

  const standings: SeasonStanding[] =
    season.status === "closed"
      ? await readSeasonSnapshot(auth.supabase, season.id)
      : await computeSeasonStandings(auth.supabase, season);

  // Faces come from the accounts: by id where a game recorded one, by nickname for the
  // seasons imported from the club's sheets, which know names only.
  const { data: users } = await auth.supabase
    .from("client_bot_users")
    .select("telegram_id, display_name, avatar_url")
    .not("display_name", "is", null);

  const avatarById = new Map<number, string | null>();
  const avatarByNickname = new Map<string, string | null>();
  for (const user of users ?? []) {
    const record = user as {
      avatar_url: string | null;
      display_name: string | null;
      telegram_id: number;
    };

    avatarById.set(record.telegram_id, record.avatar_url);
    const nickname = normalizeNickname(record.display_name);
    if (nickname) avatarByNickname.set(nickname, record.avatar_url);
  }

  const myNickname = normalizeNickname(auth.user.display_name);
  const players = standings.map((standing) => {
    const nickname = normalizeNickname(standing.playerName);
    const isMe =
      standing.telegramId === auth.user.telegram_id ||
      (Boolean(myNickname) && nickname === myNickname);

    return {
      avatarUrl: isMe
        ? (auth.user.avatar_url ?? null)
        : (standing.telegramId ? avatarById.get(standing.telegramId) : undefined) ??
          avatarByNickname.get(nickname) ??
          null,
      eliminations: Math.round(standing.knockouts),
      games: standing.games,
      isMe,
      name: standing.playerName,
      place: standing.place,
      points: standing.points,
      top9: 0,
    };
  });

  return NextResponse.json({
    countedGames: season.countedGames,
    me:
      players.find((player) => player.isMe) ?? {
        avatarUrl: auth.user.avatar_url ?? null,
        eliminations: 0,
        games: 0,
        isMe: true,
        name: auth.user.display_name ?? "",
        place: null,
        points: null,
        top9: 0,
      },
    players,
    season: { id: season.id, status: season.status, title: season.title },
    seasons: seasons.map((item) => ({ id: item.id, status: item.status, title: item.title })),
  });
}
