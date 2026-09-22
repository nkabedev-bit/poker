import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import { readClientLiveState } from "@/lib/client-tma/live-state";
import { loadPlayerAvatars } from "@/lib/players/avatars";
import { buildLiveRoom } from "@/lib/tables/live-tables";
import { isSameTelegramAccount } from "@/lib/players/same-account";
import { buildNicknameKey } from "@/lib/players/nickname-key";

export const dynamic = "force-dynamic";

/**
 * The room table by table: who is still in at each one, and who is already out.
 *
 * Read when a player opens the game and again only when the number of survivors moves,
 * which the light beat already tells them — the roster is the heavy half of this state
 * and there is no reason to carry it twice a minute.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const live = await readClientLiveState(auth.supabase);
  // Nothing to show between games: the roster of a tournament that has not started is
  // the desk's business, and the one of a finished game is on the results page.
  if (!live) return NextResponse.json({ eliminated: [], tables: [], tournamentName: null });

  const [context, avatars] = await Promise.all([
    loadCurrentTournamentContext(auth.supabase),
    loadPlayerAvatars(auth.supabase),
  ]);

  if (!context) return NextResponse.json({ eliminated: [], tables: [], tournamentName: null });

  // A player who signed in on the web has no Telegram id on the roster, so the nickname
  // is what finds them — the same way the finishing table does it.
  const myNicknameKey = buildNicknameKey(auth.user.display_name ?? "");

  const room = buildLiveRoom(context.extras.players, {
    // The lists draw faces the size of a fingernail, so thumbnails do.
    findAvatar: (player) =>
      avatars.find({ name: player.name, telegramId: player.telegramId }).thumbUrl,
    isMe: (player) =>
      isSameTelegramAccount(auth.user.telegram_id, player.telegramId) ||
      (Boolean(myNicknameKey) && buildNicknameKey(player.name) === myNicknameKey),
  });

  return NextResponse.json({ ...room, tournamentName: live.tournamentName });
}
