import { after, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { validateClientInitData } from "./auth";
import { readCookie, readSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { shouldRefreshAvatar } from "@/lib/client-bot/avatar-policy";

/**
 * One club account, however its owner got in.
 *
 * A player who came through the bot is known by `telegram_id`; one who signed in on the
 * web is known by `yandex_id` and has no Telegram at all. Everything past this point
 * works off `id`, so the rest of the app never has to ask which door was used.
 */
export type ClientAccount = {
  avatar_is_custom: boolean | null;
  avatar_synced_at: string | null;
  free_entries: number;
  vip_free_entries: number;
  avatar_url: string | null;
  /** The small copy the lists draw; null on an account photographed before them. */
  avatar_thumb_url: string | null;
  email: string | null;
  id: string;
  telegram_id: number | null;
  yandex_id: string | null;
  username: string | null;
  display_name: string | null;
  profile_submitted_at: string | null;
  registered_player_id: string | null;
  games_played: number;
  eliminations_count: number;
  top7_count: number;
};

const ACCOUNT_COLUMNS =
  "id, telegram_id, yandex_id, email, username, display_name, avatar_url, avatar_thumb_url, avatar_is_custom, avatar_synced_at, free_entries, vip_free_entries, profile_submitted_at, registered_player_id, games_played, eliminations_count, top7_count";

// Authenticates a client app request through either door. Unlike requireTmaAuth, it does
// NOT require the caller to be a tournament admin — any club account is allowed.
export async function requireClientTmaAuth(request: Request) {
  const initData = request.headers.get("X-Telegram-Init-Data");
  const sessionCookie = readCookie(request, SESSION_COOKIE);

  if (!initData && !sessionCookie) {
    return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
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

  // Telegram wins when both are present: the mini-app always sends its init data, and a
  // stale web session left in the same browser must not decide who is playing.
  const telegramId = initData ? validateClientInitData(initData).userId ?? null : null;
  const accountId =
    telegramId === null && sessionCookie
      ? readSessionToken(sessionCookie, env.SESSION_SECRET ?? "")
      : null;

  if (telegramId === null && accountId === null) {
    return { error: NextResponse.json({ error: "Invalid sign-in" }, { status: 401 }) };
  }

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const query = supabase.from("client_bot_users").select(ACCOUNT_COLUMNS);
  const { data: user } = await (
    accountId ? query.eq("id", accountId) : query.eq("telegram_id", telegramId)
  ).maybeSingle();

  if (!user) {
    return { error: NextResponse.json({ error: "Not registered in bot" }, { status: 403 }) };
  }

  const account = user as ClientAccount;

  // Photos used to be fetched only when a player wrote to the bot, so someone who opens
  // the app but never messages it stayed faceless in the standings. Opening the app is
  // just as good a moment — it runs after the response, at most once a week per player.
  // Only Telegram hands photos out; a web account keeps whatever Yandex gave it.
  if (
    account.telegram_id !== null &&
    !account.avatar_is_custom &&
    shouldRefreshAvatar(account.avatar_synced_at ?? null, new Date())
  ) {
    after(async () => {
      try {
        const { syncClientBotAvatar } = await import("@/lib/client-bot/avatar");
        await syncClientBotAvatar({
          supabase,
          telegramId: account.telegram_id as number,
          token: process.env.CLIENT_TELEGRAM_BOT_TOKEN || "",
        });
      } catch (error) {
        console.error("Non-critical avatar sync error:", error);
      }
    });
  }

  return { userId: account.id, user: account, supabase };
}
