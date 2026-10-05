import { timingSafeEqual } from "node:crypto";

/** A Bot API method name: `sendMessage`, `getFile`. */
const METHOD = /^[A-Za-z]+$/;

/** A folder or file name inside a Telegram file path, such as `photos` or `file_12.jpg`. */
const FILE_SEGMENT = /^[\w-][\w.-]*$/;

const BOT_PREFIX = "bot";

function isAllowedToken(token: string, allowedTokens: readonly string[]) {
  const candidate = Buffer.from(token);

  return allowedTokens.some((allowed) => {
    const expected = Buffer.from(allowed);
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  });
}

function tokenOf(segment: string | undefined, allowedTokens: readonly string[]) {
  if (!segment?.startsWith(BOT_PREFIX)) return null;

  const token = segment.slice(BOT_PREFIX.length);
  return token && isAllowedToken(token, allowedTokens) ? token : null;
}

/**
 * The Bot API path a relay request asks for, or null when the relay must refuse it.
 *
 * Only the two shapes the club's code uses get through — a method call
 * (`bot<token>/<method>`) and a file download (`file/bot<token>/<path>`) — and only for
 * the club's own bots. Anyone else asking gets nothing, so the relay never works as an
 * open door to Telegram on the club's Vercel quota.
 */
export function relayTargetPath(segments: readonly string[], allowedTokens: readonly string[]) {
  const tokens = allowedTokens.filter(Boolean);
  if (tokens.length === 0) return null;

  const [first, ...rest] = segments;

  if (first === "file") {
    const [botSegment, ...filePath] = rest;
    const token = tokenOf(botSegment, tokens);
    if (!token || filePath.length === 0 || !filePath.every((part) => FILE_SEGMENT.test(part))) {
      return null;
    }
    return `file/${BOT_PREFIX}${token}/${filePath.join("/")}`;
  }

  const token = tokenOf(first, tokens);
  const [method, ...extra] = rest;
  if (!token || !method || extra.length > 0 || !METHOD.test(method)) return null;

  return `${BOT_PREFIX}${token}/${method}`;
}
