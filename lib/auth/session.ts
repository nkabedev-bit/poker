import "server-only";

import crypto from "crypto";

/**
 * The web visitor's session.
 *
 * A player who signs in through Yandex has no Telegram to prove who they are on every
 * request, so the server hands them a cookie that says which account they are and signs
 * it. The cookie carries the account's own id and nothing else worth stealing: it is
 * proof of a completed sign-in, not a key to anything on its own.
 */
export const SESSION_COOKIE = "club_session";

/** Long enough that a player who comes once a month is never asked to sign in again. */
export const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

function signBody(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSessionToken(accountId: string, secret: string, now = new Date()) {
  const body = Buffer.from(
    JSON.stringify({ iat: Math.floor(now.getTime() / 1000), uid: accountId }),
  ).toString("base64url");

  return `${body}.${signBody(body, secret)}`;
}

/**
 * The account a cookie stands for, or null if it does not stand for one.
 *
 * A cookie that was edited, signed with another secret or left over from three months
 * ago is refused the same way — the caller learns nothing about which it was.
 */
export function readSessionToken(
  token: string | null | undefined,
  secret: string,
  now = new Date(),
): string | null {
  if (!token || !secret) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = signBody(body, secret);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);

  // Length has to match before the constant-time compare, which refuses to run on
  // buffers of different sizes.
  if (given.length !== wanted.length) return null;
  if (!crypto.timingSafeEqual(given, wanted)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      iat?: unknown;
      uid?: unknown;
    };
    const issuedAt = Number(payload.iat);
    const accountId = typeof payload.uid === "string" ? payload.uid : "";

    if (!accountId || !Number.isFinite(issuedAt)) return null;
    if (Math.floor(now.getTime() / 1000) - issuedAt > SESSION_MAX_AGE_SECONDS) return null;

    return accountId;
  } catch {
    return null;
  }
}
