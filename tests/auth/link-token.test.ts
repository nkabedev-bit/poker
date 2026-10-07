import { describe, expect, it } from "vitest";
import { createLinkToken, LINK_TOKEN_TTL_SECONDS, readLinkToken } from "@/lib/auth/link-token";
import { createSessionToken, readSessionToken } from "@/lib/auth/session";

const SECRET = "a-secret-of-sixteen-plus";
const NOW = new Date("2026-10-07T12:00:00Z");

describe("link pass", () => {
  it("names the account it was issued for", () => {
    expect(readLinkToken(createLinkToken("acc-1", SECRET, NOW), SECRET, NOW)).toBe("acc-1");
  });

  it("runs out after half an hour", () => {
    const token = createLinkToken("acc-1", SECRET, NOW);
    const later = new Date(NOW.getTime() + (LINK_TOKEN_TTL_SECONDS + 1) * 1000);
    expect(readLinkToken(token, SECRET, later)).toBeNull();
  });

  it("is refused when edited or signed with another secret", () => {
    const token = createLinkToken("acc-1", SECRET, NOW);
    const [body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ exp: 9999999999, uid: "acc-2" })).toString("base64url");

    expect(readLinkToken(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(readLinkToken(`${body}.${signature}x`, SECRET, NOW)).toBeNull();
    expect(readLinkToken(token, "another-secret-entirely", NOW)).toBeNull();
    expect(readLinkToken("", SECRET, NOW)).toBeNull();
  });

  it("is never taken for a session, nor a session for a pass", () => {
    expect(readSessionToken(createLinkToken("acc-1", SECRET, NOW), SECRET, NOW)).toBeNull();
    expect(readLinkToken(createSessionToken("acc-1", SECRET, NOW), SECRET, NOW)).toBeNull();
  });
});
