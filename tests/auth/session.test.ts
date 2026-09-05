import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  readSessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";

const SECRET = "a-secret-long-enough-to-sign-with";

describe("the web session cookie", () => {
  it("reads back the account it was written for", () => {
    const token = createSessionToken("account-1", SECRET);

    expect(readSessionToken(token, SECRET)).toBe("account-1");
  });

  it("refuses a cookie signed with another secret", () => {
    const token = createSessionToken("account-1", SECRET);

    expect(readSessionToken(token, "a-different-secret-of-its-own")).toBeNull();
  });

  // Swapping the account id inside the cookie is the whole attack worth guarding.
  it("refuses a cookie whose account was edited", () => {
    const token = createSessionToken("account-1", SECRET);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ iat: 1, uid: "account-2" })).toString("base64url");

    expect(readSessionToken(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it("refuses a cookie that has run out", () => {
    const issued = new Date("2026-01-01T00:00:00.000Z");
    const token = createSessionToken("account-1", SECRET, issued);
    const later = new Date(issued.getTime() + (SESSION_MAX_AGE_SECONDS + 1) * 1000);

    expect(readSessionToken(token, SECRET, later)).toBeNull();
    expect(readSessionToken(token, SECRET, issued)).toBe("account-1");
  });

  it("refuses nonsense instead of throwing on it", () => {
    expect(readSessionToken(null, SECRET)).toBeNull();
    expect(readSessionToken("", SECRET)).toBeNull();
    expect(readSessionToken("no-dot-here", SECRET)).toBeNull();
    expect(readSessionToken("not.base64url", SECRET)).toBeNull();
    expect(readSessionToken(createSessionToken("account-1", SECRET), "")).toBeNull();
  });
});
