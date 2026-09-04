import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { buildNicknameKey } from "@/lib/players/nickname-key";

export const dynamic = "force-dynamic";

const MATCHES_SHOWN = 8;

/**
 * Members of the club, looked up by nickname — for now, whoever a player names as the
 * +1 on a "1+1" ticket.
 *
 * Only the nickname and the face come back, and both are already on the board in the
 * hall and in the rating table. Telegram ids stay on the server: the player picks a
 * nickname, and the routes that act on the choice resolve the account themselves.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const key = buildNicknameKey(query);
  if (key.length < 2) return NextResponse.json({ players: [] });

  const { data, error } = await auth.supabase
    .from("client_bot_users")
    .select("telegram_id, display_name, avatar_url, avatar_thumb_url, nickname_key")
    .not("display_name", "is", null)
    .not("profile_submitted_at", "is", null)
    .like("nickname_key", `%${key}%`)
    .limit(MATCHES_SHOWN + 1);

  if (error) throw error;

  const players = (data ?? [])
    .map((row) => {
      const record = row as {
        avatar_thumb_url: string | null;
        avatar_url: string | null;
        display_name: string | null;
        nickname_key: string | null;
        telegram_id: number;
      };

      return {
        // The search draws a row of small circles, so it gets the small copies.
        avatarUrl: record.avatar_thumb_url ?? record.avatar_url,
        isMe: record.telegram_id === auth.user.telegram_id,
        key: record.nickname_key ?? "",
        name: record.display_name ?? "",
      };
    })
    // A player cannot bring themselves, so their own account is no answer to the search.
    .filter((player) => !player.isMe && player.key && player.name)
    .slice(0, MATCHES_SHOWN)
    .map(({ avatarUrl, key: playerKey, name }) => ({ avatarUrl, key: playerKey, name }));

  return NextResponse.json({ players });
}
