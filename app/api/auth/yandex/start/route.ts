import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { buildAuthorizeUrl, getRedirectUri, OAUTH_STATE_COOKIE } from "@/lib/auth/yandex";

export const dynamic = "force-dynamic";

/** How long the player has to finish signing in before the attempt is forgotten. */
const STATE_MAX_AGE_SECONDS = 10 * 60;

/**
 * Sends the player to Yandex to sign in.
 *
 * The `state` is a one-off value kept in a cookie of its own and checked when they come
 * back: without it, anyone could hand a player a finished Yandex code and sign them into
 * an account that is not theirs.
 */
export async function GET() {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json({ error: "Сервер не настроен" }, { status: 503 });
  }

  const redirectUri = getRedirectUri();

  if (!env.YANDEX_CLIENT_ID || !redirectUri) {
    return NextResponse.json(
      { error: "Вход через Яндекс не настроен: нет YANDEX_CLIENT_ID или адреса возврата" },
      { status: 503 },
    );
  }

  const state = crypto.randomBytes(16).toString("base64url");
  const response = NextResponse.redirect(
    buildAuthorizeUrl({ clientId: env.YANDEX_CLIENT_ID, redirectUri, state }),
  );

  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: STATE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: true,
  });

  return response;
}
