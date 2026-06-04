import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { validateClientInitData } from "./auth";

export type ClientTmaUser = {
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
      "telegram_id, username, display_name, profile_submitted_at, registered_player_id, games_played, eliminations_count, top7_count",
    )
    .eq("telegram_id", userId)
    .maybeSingle();

  if (!user) {
    return { error: NextResponse.json({ error: "Not registered in bot" }, { status: 403 }) };
  }

  return { userId, user: user as ClientTmaUser, supabase };
}
