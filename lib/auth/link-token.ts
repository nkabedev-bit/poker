import "server-only";

import crypto from "crypto";

/**
 * A short-lived pass that carries a Telegram player into the web app as themselves.
 *
 * The mini-app knows who the player is — Telegram signs that — but the web app does not:
 * there they sign in with Yandex. The pass is issued inside the mini-app, rides in the
 * link that opens the phone's browser, and lets the Yandex sign-in attach to the profile
 * the player already has, with no nickname to type and no way to claim someone else's.
 *
 * Signed with the session secret under its own label, so a pass is never mistaken for a
 * session cookie or the other way round.
 */
export const LINK_TOKEN_TTL_SECONDS = 30 * 60;

/** Holds the pass between the "Продолжить" press and Yandex sending the player back. */
export const OAUTH_LINK_COOKIE = "club_link";

function sign(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`link:${body}`).digest("base64url");
}

export function createLinkToken(accountId: string, secret: string, now = new Date()) {
  const body = Buffer.from(
    JSON.stringify({ exp: Math.floor(now.getTime() / 1000) + LINK_TOKEN_TTL_SECONDS, uid: accountId }),
  ).toString("base64url");

  return `${body}.${sign(body, secret)}`;
}

/** The account a pass was issued for, or null for an edited, foreign or stale one. */
export function readLinkToken(token: string | null | undefined, secret: string, now = new Date()) {
  if (!token || !secret) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const given = Buffer.from(signature);
  const wanted = Buffer.from(sign(body, secret));
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { exp?: unknown; uid?: unknown };
    const expiresAt = Number(payload.exp);
    const accountId = typeof payload.uid === "string" ? payload.uid : "";

    if (!accountId || !Number.isFinite(expiresAt)) return null;
    if (Math.floor(now.getTime() / 1000) > expiresAt) return null;

    return accountId;
  } catch {
    return null;
  }
}
