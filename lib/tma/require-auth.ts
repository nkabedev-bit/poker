import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateInitData } from "./auth";
import { readRole, ROLE_LABELS, type TmaRole } from "./roles";
import { passwordStamp, readTmaSessionToken, TMA_SESSION_COOKIE } from "./web-session";
import { readCookie } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";

type DeskAdmin = { adminName: string; role: TmaRole; userId: number | null };

type TmaAuth =
  | { error: NextResponse }
  | (DeskAdmin & { error?: undefined; supabase: SupabaseClient });

function refuse(error: string, status: number) {
  return { error: NextResponse.json({ error }, { status }) };
}

/**
 * The admin behind a desk request, or the answer to send back instead.
 *
 * Inside Telegram the signed init data names the admin, and the list of admins says
 * their role. In a phone's browser the desk cookie says which shared password opened
 * it; that desk has no Telegram id, so `userId` is null there and the logs show the
 * role in its place.
 *
 * `floorOnly` guards everything beyond the tables — the cash desk, the tournament, the
 * posters and the bot. Hiding a tab is not enough: the room and the cash desk call some
 * of the same endpoints, so a dealer is turned away here, on the server.
 */
export async function requireTmaAuth(
  request: Request,
  options: { floorOnly?: boolean } = {},
): Promise<TmaAuth> {
  const initData = request.headers.get("X-Telegram-Init-Data");
  const sessionCookie = initData ? null : readCookie(request, TMA_SESSION_COOKIE);

  if (!initData && !sessionCookie) return refuse("No init data", 401);

  let telegramId: number | null = null;
  if (initData) {
    const { ok, userId } = validateInitData(initData);
    if (!ok || !userId) return refuse("Invalid init data", 401);
    telegramId = userId;
  }

  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return refuse("Server environment is not configured", 503);
  }

  // Service role: the desk is checked here, not by the database's own sign-in.
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const admin =
    telegramId !== null
      ? await readTelegramAdmin(supabase, telegramId)
      : await readBrowserDesk(supabase, sessionCookie, env.SESSION_SECRET ?? "");
  if ("error" in admin) return admin;

  if (options.floorOnly && admin.role !== "floor") return refuse("Это доступно только флору", 403);

  return { ...admin, supabase };
}

async function readTelegramAdmin(
  supabase: SupabaseClient,
  telegramId: number,
): Promise<DeskAdmin | { error: NextResponse }> {
  const { data: admin } = await supabase
    .from("tma_admins")
    .select("telegram_id, name, role")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!admin) return refuse("Forbidden", 403);

  return { adminName: admin.name, role: readRole(telegramId, admin.role), userId: telegramId };
}

/** A browser desk holds while the password that opened it is still the current one. */
async function readBrowserDesk(
  supabase: SupabaseClient,
  sessionCookie: string | null,
  secret: string,
): Promise<DeskAdmin | { error: NextResponse }> {
  const session = readTmaSessionToken(sessionCookie, secret);
  if (!session) return refuse("Войдите заново", 401);

  const { data } = await supabase
    .from("tma_web_passwords")
    .select("password_hash")
    .eq("role", session.role)
    .maybeSingle();

  if (!data || passwordStamp(data.password_hash) !== session.stamp) {
    return refuse("Пароль сменили — войдите заново", 401);
  }

  return { adminName: `Браузер · ${ROLE_LABELS[session.role]}`, role: session.role, userId: null };
}
