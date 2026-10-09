import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { TmaRole } from "@/lib/tma/roles";
import {
  createTmaSessionToken,
  TMA_SESSION_COOKIE,
  TMA_SESSION_MAX_AGE_SECONDS,
  verifyWebPassword,
} from "@/lib/tma/web-session";

export const dynamic = "force-dynamic";

const MAX_FAILED_SIGN_INS = 5;
const FAILED_SIGN_IN_WINDOW_MS = 10 * 60 * 1000;

/**
 * Wrong passwords per address. The passwords are shared and typed on phones, so they
 * stay guessable however long the bot makes them; five misses close the door for ten
 * minutes. Kept in memory: the app runs as one process, and a restart forgetting the
 * count costs nothing worth a table.
 */
const failedSignIns = new Map<string, { count: number; resetAt: number }>();

/**
 * Caddy in front of the app drops whatever X-Forwarded-For the visitor sent and writes
 * the real address, so the last entry is the one to go by.
 */
function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",").pop()?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isLockedOut(address: string, now: number) {
  const entry = failedSignIns.get(address);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= MAX_FAILED_SIGN_INS;
}

/** Past this many addresses the stale ones are swept, so guessing from many cannot pile up. */
const FAILED_SIGN_INS_SWEEP_SIZE = 1000;

function countFailedSignIn(address: string, now: number) {
  if (failedSignIns.size >= FAILED_SIGN_INS_SWEEP_SIZE) {
    for (const [key, entry] of failedSignIns) {
      if (entry.resetAt <= now) failedSignIns.delete(key);
    }
  }

  const entry = failedSignIns.get(address);
  if (!entry || entry.resetAt <= now) {
    failedSignIns.set(address, { count: 1, resetAt: now + FAILED_SIGN_IN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/**
 * Opens the desk in a browser. The password says the role: the floors' opens all of
 * it, the dealers' the room and the knockouts.
 */
export async function POST(request: Request) {
  const now = Date.now();
  const address = clientAddress(request);
  if (isLockedOut(address, now)) {
    return NextResponse.json({ error: "Слишком много попыток. Попробуйте через 10 минут." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 200) {
    return NextResponse.json({ error: "Введите пароль" }, { status: 400 });
  }

  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json({ error: "Сервер не настроен" }, { status: 503 });
  }

  if (!env.SESSION_SECRET) {
    return NextResponse.json({ error: "Нет SESSION_SECRET" }, { status: 503 });
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from("tma_web_passwords").select("role, password_hash");
  if (error) {
    console.error("Failed to read desk passwords:", error.message);
    return NextResponse.json({ error: "Не удалось проверить пароль" }, { status: 500 });
  }

  const match = ((data ?? []) as Array<{ password_hash: string; role: TmaRole }>).find((row) =>
    verifyWebPassword(password, row.password_hash),
  );

  if (!match) {
    countFailedSignIn(address, now);
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  failedSignIns.delete(address);

  const response = NextResponse.json({ role: match.role });
  // Strict: the desk's own requests are all same-site, so no other site's page can
  // ride on the cookie.
  response.cookies.set(
    TMA_SESSION_COOKIE,
    createTmaSessionToken({ passwordHash: match.password_hash, role: match.role }, env.SESSION_SECRET),
    { httpOnly: true, maxAge: TMA_SESSION_MAX_AGE_SECONDS, path: "/", sameSite: "strict", secure: true },
  );

  return response;
}

/** Closes the desk on this phone. */
export async function DELETE() {
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(TMA_SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: true,
  });
  return response;
}
