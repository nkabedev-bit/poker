import { after, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { validateClientInitData } from "./auth";
import { shouldRefreshAvatar } from "@/lib/client-bot/avatar-policy";

export type ClientTmaUser = {
  avatar_is_custom: boolean | null;
  avatar_synced_at: string | null;
  free_entries: number;
  vip_free_entries: number;
  avatar_url: string | null;
  /** The small copy the lists draw; null on an account photographed before them. */
  avatar_thumb_url: string | null;
  telegram_id: number;
  username: string | null;
  display_name: string | null;
  profile_submitted_at: string | null;
  registered_player_id: string | null;
  games_played: number;
  eliminations_count: number;
  top7_count: number;
};

// Authenticates a client mini-app request. Unlike requireTmaAuth, it does NOT
// require the user to be a tournament admin — any client bot user is allowed.
export async function requireClientTmaAuth(request: Request) {
  const initData = request.headers.get("X-Telegram-Init-Data");

  if (!initData) {
    return { error: NextResponse.json({ error: "No init data" }, { status: 401 }) };
  }

  const { ok, userId } = validateClientInitData(initData);

  if (!ok || !userId) {
    return { error: NextResponse.json({ error: "Invalid init data" }, { status: 401 }) };
  }

  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return {
      error: NextResponse.json(
        { error: "Server environment is not configured" },
        { status: 503 },
      ),
    };
  }

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: user } = await supabase
    .from("client_bot_users")
    .select(
      "telegram_id, username, display_name, avatar_url, avatar_thumb_url, avatar_is_custom, avatar_synced_at, free_entries, vip_free_entries, profile_submitted_at, registered_player_id, games_played, eliminations_count, top7_count",
    )
    .eq("telegram_id", userId)
    .maybeSingle();

  if (!user) {
    return { error: NextResponse.json({ error: "Not registered in bot" }, { status: 403 }) };
  }

  const clientUser = user as ClientTmaUser;

  // Photos used to be fetched only when a player wrote to the bot, so someone who opens
  // the app but never messages it stayed faceless in the standings. Opening the app is
  // just as good a moment — it runs after the response, at most once a week per player.
  if (
    !clientUser.avatar_is_custom &&
    shouldRefreshAvatar(clientUser.avatar_synced_at ?? null, new Date())
  ) {
    after(async () => {
      try {
        const { syncClientBotAvatar } = await import("@/lib/client-bot/avatar");
        await syncClientBotAvatar({
          supabase,
          telegramId: clientUser.telegram_id,
          token: process.env.CLIENT_TELEGRAM_BOT_TOKEN || "",
        });
      } catch (error) {
        console.error("Non-critical avatar sync error:", error);
      }
    });
  }

  return { userId, user: clientUser, supabase };
}
