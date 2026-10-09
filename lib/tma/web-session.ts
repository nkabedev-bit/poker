import "server-only";

import crypto from "crypto";
import type { TmaRole } from "./roles";

/**
 * The desk opened in a phone's browser rather than inside Telegram.
 *
 * There is no Telegram there to say who is asking, so the club keeps two shared
 * passwords, one for the floors and one for the dealers, and the password typed in is
 * what decides the role. The server then hands out a cookie that says which role it
 * opened and which version of that password did it: a new password closes every desk
 * opened with the old one.
 *
 * Signed with the session secret under its own label, so a desk cookie is never taken
 * for a player's session or the other way round.
 */
export const TMA_SESSION_COOKIE = "tma_session";

export const TMA_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Short shared passwords are guessed; the bot refuses anything under this. */
export const MIN_WEB_PASSWORD_LENGTH = 8;

const SCRYPT_KEY_LENGTH = 32;

export function hashWebPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyWebPassword(password: string, stored: string) {
  const [scheme, saltText, hashText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;

  const expected = Buffer.from(hashText, "base64url");
  const given = crypto.scryptSync(password, Buffer.from(saltText, "base64url"), expected.length);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Which password a cookie was opened with. Every new password gets a fresh salt, so the
 * stamp moves even when the same word is set again — and the old cookies stop working.
 */
export function passwordStamp(storedHash: string) {
  return crypto.createHash("sha256").update(storedHash).digest("base64url").slice(0, 16);
}

function sign(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`tma:${body}`).digest("base64url");
}

export function createTmaSessionToken(
  { passwordHash, role }: { passwordHash: string; role: TmaRole },
  secret: string,
  now = new Date(),
) {
  const body = Buffer.from(
    JSON.stringify({ iat: Math.floor(now.getTime() / 1000), role, v: passwordStamp(passwordHash) }),
  ).toString("base64url");

  return `${body}.${sign(body, secret)}`;
}

/** The role and password version a cookie stands for, or null for an edited, foreign or stale one. */
export function readTmaSessionToken(
  token: string | null | undefined,
  secret: string,
  now = new Date(),
): { role: TmaRole; stamp: string } | null {
  if (!token || !secret) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const given = Buffer.from(signature);
  const wanted = Buffer.from(sign(body, secret));
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      iat?: unknown;
      role?: unknown;
      v?: unknown;
    };
    const issuedAt = Number(payload.iat);
    const role = payload.role === "floor" || payload.role === "dealer" ? payload.role : null;
    const stamp = typeof payload.v === "string" ? payload.v : "";

    if (!role || !stamp || !Number.isFinite(issuedAt)) return null;
    if (Math.floor(now.getTime() / 1000) - issuedAt > TMA_SESSION_MAX_AGE_SECONDS) return null;

    return { role, stamp };
  } catch {
    return null;
  }
}
