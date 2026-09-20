import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { validateClientInitData } from "./auth";
import { readCookie, readSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Whoever is asking is signed in to the club — and that is the whole question.
 *
 * `requireClientTmaAuth` also reads the account out of the database, which is right
 * when the answer is about this player. The live tournament card is the same for
 * everybody in the room and is asked for every half minute by every phone in it, so
 * the account read would double the cost of the beat for nothing: both doors are
 * checked by signature alone, without touching the database.
 */
export function requireClientSignedIn(request: Request) {
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
      error: NextResponse.json({ error: "Server environment is not configured" }, { status: 503 }),
    };
  }

  const telegramId = initData ? validateClientInitData(initData).userId ?? null : null;
  const accountId =
    telegramId === null && sessionCookie
      ? readSessionToken(sessionCookie, env.SESSION_SECRET ?? "")
      : null;

  if (telegramId === null && accountId === null) {
    return { error: NextResponse.json({ error: "Invalid sign-in" }, { status: 401 }) };
  }

  return { error: null as null };
}
