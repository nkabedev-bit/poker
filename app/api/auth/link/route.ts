import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { getServerEnv } from "@/lib/env";
import { linkExistingAccount } from "@/lib/auth/link-account";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const MESSAGES = {
  already_linked: "Этот профиль уже привязан к другому аккаунту Яндекса. Напишите в поддержку.",
  no_birth_date:
    "В вашей анкете не записана дата рождения — привязать профиль может только администратор.",
  not_found: "Не нашли профиль с таким ником. Проверьте написание или заполните анкету заново.",
  wrong_details: "Ник и дата рождения не совпали. Проверьте ещё раз.",
} as const;

/**
 * A returning player claiming the profile the club already keeps for them.
 *
 * The account Yandex just created is thrown away and their old one takes over the Yandex
 * login, so their games, their rating and their free entries stay where they are rather
 * than starting again from nothing.
 */
export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json({ error: "Сервер не настроен" }, { status: 503 });
  }

  if (!env.SESSION_SECRET) {
    return NextResponse.json({ error: "Нет SESSION_SECRET" }, { status: 503 });
  }

  // Only a freshly signed-in web account has anything to claim: a player already known
  // to the club is who they are, and must not be able to take over somebody else.
  if (!auth.user.yandex_id || auth.user.profile_submitted_at) {
    return NextResponse.json(
      { error: "not_allowed", message: "Профиль уже определён." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const outcome = await linkExistingAccount(auth.supabase, {
    birthDate: String(body.birthDate ?? ""),
    newAccountId: auth.user.id,
    nickname: String(body.nickname ?? ""),
  });

  if (outcome.error) {
    return NextResponse.json(
      { error: outcome.error, message: MESSAGES[outcome.error] },
      { status: outcome.error === "already_linked" ? 409 : 404 },
    );
  }

  // The account Yandex made a minute ago goes first, and only then does the old profile
  // take the login up: one account may hold a Yandex id, and an account with no way in
  // at all is refused outright — so it cannot be emptied and kept.
  //
  // It holds nothing: no sign-ups, no games, no passes. Should the move below fail, the
  // player signs in again and gets another empty one, having lost nothing.
  const { error: dropError } = await auth.supabase
    .from("client_bot_users")
    .delete()
    .eq("id", auth.user.id);

  if (dropError) throw dropError;

  const { error: moveError } = await auth.supabase
    .from("client_bot_users")
    .update({ email: auth.user.email, yandex_id: auth.user.yandex_id })
    .eq("id", outcome.account.id);

  if (moveError) throw moveError;

  const response = NextResponse.json({ linked: true });

  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(outcome.account.id, env.SESSION_SECRET),
    { httpOnly: true, maxAge: SESSION_MAX_AGE_SECONDS, path: "/", sameSite: "lax", secure: true },
  );

  return response;
}
