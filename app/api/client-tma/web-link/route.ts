import { NextResponse } from "next/server";
import { createLinkToken } from "@/lib/auth/link-token";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Issues the pass that takes a mini-app player into the web app as themselves.
 *
 * Only from inside Telegram: the pass is worth something because Telegram vouched for the
 * player who asked for it. A web visitor is already in the web app and has nothing to
 * carry over.
 */
export async function POST(request: Request) {
  if (!request.headers.get("X-Telegram-Init-Data")) {
    return NextResponse.json({ error: "Only from the Telegram mini-app" }, { status: 403 });
  }

  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const secret = getServerEnv().SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "Нет SESSION_SECRET" }, { status: 503 });

  return NextResponse.json({ token: createLinkToken(auth.userId, secret) });
}
