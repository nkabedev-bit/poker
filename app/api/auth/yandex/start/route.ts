import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { buildAuthorizeUrl, getRedirectUri, OAUTH_STATE_COOKIE } from "@/lib/auth/yandex";
import { OAUTH_LINK_COOKIE, readLinkToken } from "@/lib/auth/link-token";

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
export async function GET(request: Request) {
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

  // A player sent over from the mini-app carries a pass naming their profile; it waits in
  // a cookie of its own and is spent when Yandex sends them back. A pass that does not
  // read is simply dropped: the sign-in goes on as an ordinary one.
  const link = new URL(request.url).searchParams.get("link");
  if (link && env.SESSION_SECRET && readLinkToken(link, env.SESSION_SECRET)) {
    response.cookies.set(OAUTH_LINK_COOKIE, link, {
      httpOnly: true,
      maxAge: STATE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  }

  return response;
}
