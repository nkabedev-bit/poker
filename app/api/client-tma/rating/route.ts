import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import {
  computeSeasonStandings,
  listSeasons,
  readSeasonSnapshot,
} from "@/lib/seasons/store";
import { arrangeSeasonsForRating, type Season } from "@/lib/seasons/season";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { isSameTelegramAccount } from "@/lib/players/same-account";
import { loadPlayerAvatars } from "@/lib/players/avatars";
import { countGamesByNickname } from "@/lib/players/games-played";
import { resolvePlayerTier, type PlayerTier } from "@/lib/players/tier";
import { getPersistedPlayerLabel } from "@/lib/player-labels";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * How long a season's table stands while the results stay as they were.
 *
 * Four screens ask for the table — the home page's top three among them, on every open —
 * and each ask recounted the whole season, every face and every player's evenings. The
 * table only moves when the results do, so it is counted again as soon as they change —
 * a finished game writes its rows — and otherwise once a day, for what leaves the
 * results' fingerprint as it was: a new nickname or photo, a player's tier, a place
 * corrected in the admin.
 */
const RATING_CACHE_MS = 24 * 60 * 60_000;

/** One line of a season's table as everybody sees it; "ВЫ" is put on per player. */
type SharedLine = {
  avatarUrl: string | null;
  eliminations: number;
  games: number;
  name: string;
  place: number | null;
  points: number | null;
  telegramId: number | null;
  tier: PlayerTier | null;
  top9: number;
};

const tables = new Map<
  string,
  { lines: Promise<SharedLine[]>; readAt: number; results: string | null }
>();

function normalizeNickname(value: string | null | undefined) {
  return buildNicknameKey(value ?? "");
}

async function readSeasonTable(supabase: SupabaseClient, season: Season): Promise<SharedLine[]> {
  const standings =
    season.status === "closed"
      ? await readSeasonSnapshot(supabase, season.id)
      : await computeSeasonStandings(supabase, season);

  // Faces come from the accounts: by id where a game recorded one, by nickname for the
  // seasons imported from the club's sheets, which know names only. The table draws them
  // 34 pixels across, so it is served thumbnails rather than whole profile pictures.
  // Tiers are earned over the club's whole history, not within one season, so the count
  // comes from every game a player has behind them.
  const [avatars, gamesByNickname, context] = await Promise.all([
    loadPlayerAvatars(supabase),
    countGamesByNickname(
      supabase,
      standings.map((standing) => standing.playerName),
    ),
    loadCurrentTournamentContext(supabase),
  ]);
  const labels = context?.extras.playerLabels;

  return standings.map((standing) => ({
    avatarUrl: avatars.find({ name: standing.playerName, telegramId: standing.telegramId })
      .thumbUrl,
    eliminations: Math.round(standing.knockouts),
    games: standing.games,
    name: standing.playerName,
    place: standing.place,
    points: standing.points,
    telegramId: standing.telegramId,
    tier: resolvePlayerTier({
      games: gamesByNickname.get(buildNicknameKey(standing.playerName)) ?? 0,
      label: getPersistedPlayerLabel(labels, standing.playerName),
    }),
    top9: 0,
  }));
}

/**
 * A short fingerprint of the stored results: how many rows there are and when the newest
 * was written. A finished game adds its rows and moves it at once. Costs one row and a
 * count; null when it cannot be read.
 */
async function readResultsStamp(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { count, data, error } = await supabase
      .from("tournament_results")
      .select("created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return null;
    return `${count ?? 0}:${(data?.[0] as { created_at?: string } | undefined)?.created_at ?? ""}`;
  } catch {
    return null;
  }
}

/**
 * The season's table: counted again when the results have changed or the day is out,
 * and otherwise the same count for everyone. A fingerprint that cannot be read keeps the
 * count it has rather than recounting on every open.
 */
async function cachedSeasonTable(supabase: SupabaseClient, season: Season) {
  // Closing a season or changing its rule makes it another table.
  const key = `${season.id}:${season.status}:${season.countedGames ?? ""}`;
  const results = await readResultsStamp(supabase);
  const cached = tables.get(key);

  if (
    cached &&
    Date.now() - cached.readAt < RATING_CACHE_MS &&
    (results === null || results === cached.results)
  ) {
    return cached.lines;
  }

  const lines = readSeasonTable(supabase, season);
  tables.set(key, { lines, readAt: Date.now(), results });
  // A failed count is not kept: the next player to open the table asks again.
  lines.catch(() => {
    if (tables.get(key)?.lines === lines) tables.delete(key);
  });

  return lines;
}

/**
 * The club standings for one season.
 *
 * A closed season is served from the table it was frozen with — that is what the club
 * announced, and correcting an old game must not quietly move it. An open season is
 * computed live under that season's own scoring rule: a regular one from the games
 * stamped with it, a parallel one from the rating games played inside its dates.
 *
 * Without a season asked for, the regular season is served — the APC cup qualifier runs
 * beside it as a tab of its own.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const seasons = arrangeSeasonsForRating(await listSeasons(auth.supabase));

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

  const lines = await cachedSeasonTable(auth.supabase, season);

  const myNickname = normalizeNickname(auth.user.display_name);
  // One line is the player's own. The one with their Telegram id, when there is one; by
  // nickname only when there is not — a web sign-in has no Telegram id, and games typed
  // in by hand may carry none — and then never a line another account owns. Matching on
  // either at once marked two lines "ВЫ" the evening two accounts were swapped.
  const hasOwnLine = lines.some((line) =>
    isSameTelegramAccount(auth.user.telegram_id, line.telegramId),
  );
  const players = lines.map(({ telegramId, ...line }) => {
    const isMe = hasOwnLine
      ? isSameTelegramAccount(auth.user.telegram_id, telegramId)
      : !telegramId && Boolean(myNickname) && normalizeNickname(line.name) === myNickname;

    return {
      ...line,
      avatarUrl: isMe ? (auth.user.avatar_thumb_url ?? auth.user.avatar_url ?? null) : line.avatarUrl,
      isMe,
    };
  });

  return NextResponse.json({
    countedGames: season.countedGames,
    me:
      players.find((player) => player.isMe) ?? {
        avatarUrl: auth.user.avatar_thumb_url ?? auth.user.avatar_url ?? null,
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
