import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import {
  exchangeCodeForToken,
  fetchYandexUser,
  OAUTH_STATE_COOKIE,
} from "@/lib/auth/yandex";
import {
  createSessionToken,
  readCookie,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const ACCOUNT_COLUMNS = "id, display_name, profile_submitted_at";

type Account = {
  display_name: string | null;
  id: string;
  profile_submitted_at: string | null;
};

/** The columns this route needs arrive with migration 202609050004. */
function isMissingYandexColumns(error: { code?: string; message?: string } | null) {
  const message = String(error?.message ?? "");
  return error?.code === "42703" || message.includes("yandex_id") || message.includes("auth_provider");
}

function matches(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Where the player lands after Yandex lets them through.
 *
 * A returning club member goes straight into the app; anyone the club has never met is
 * asked whether they have played here before, which is what decides between finding
 * their old profile and filling in the questionnaire.
 */
function landingPath(account: Account) {
  return account.profile_submitted_at ? "/client" : "/client/link";
}

export async function GET(request: Request) {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json({ error: "Сервер не настроен" }, { status: 503 });
  }

  if (!env.YANDEX_CLIENT_ID || !env.YANDEX_CLIENT_SECRET || !env.SESSION_SECRET) {
    return NextResponse.json(
      { error: "Вход через Яндекс не настроен: нет ключей приложения или SESSION_SECRET" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Yandex reports a refusal in the query rather than by failing: the player pressed
  // "no", and there is nothing wrong to report to them.
  if (url.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/client", request.url));
  }

  const expectedState = readCookie(request, OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || !matches(state, expectedState)) {
    return NextResponse.json(
      { error: "Вход не завершён. Начните заново со страницы клуба." },
      { status: 400 },
    );
  }

  const accessToken = await exchangeCodeForToken({
    clientId: env.YANDEX_CLIENT_ID,
    clientSecret: env.YANDEX_CLIENT_SECRET,
    code,
  });

  const yandexUser = accessToken ? await fetchYandexUser(accessToken) : null;

  if (!yandexUser) {
    return NextResponse.json(
      { error: "Яндекс не подтвердил вход. Попробуйте ещё раз." },
      { status: 502 },
    );
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing, error: readError } = await supabase
    .from("client_bot_users")
    .select(ACCOUNT_COLUMNS)
    .eq("yandex_id", yandexUser.id)
    .maybeSingle();

  if (readError && isMissingYandexColumns(readError)) {
    return NextResponse.json(
      { error: "Миграция 202609050004 не применена — вход через Яндекс не работает" },
      { status: 503 },
    );
  }

  if (readError) throw readError;

  let account = existing as Account | null;

  if (!account) {
    // The account is created empty of everything the club cares about: the nickname,
    // the questionnaire and the history are settled on the next screen, once the player
    // says whether they have played here before.
    const { data: created, error: createError } = await supabase
      .from("client_bot_users")
      .insert({
        auth_provider: "yandex",
        avatar_url: yandexUser.avatarUrl,
        email: yandexUser.email,
        yandex_id: yandexUser.id,
      })
      .select(ACCOUNT_COLUMNS)
      .single();

    if (createError) throw createError;
    account = created as Account;
  }

  const response = NextResponse.redirect(new URL(landingPath(account), request.url));

  response.cookies.set(SESSION_COOKIE, createSessionToken(account.id, env.SESSION_SECRET), {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: true,
  });

  // The sign-in is done with; leaving the one-off value behind would only make it
  // available to be replayed.
  response.cookies.delete(OAUTH_STATE_COOKIE);

  return response;
}
