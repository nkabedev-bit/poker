import { describe, expect, it } from "vitest";
import { createSessionToken } from "@/lib/auth/session";
import {
  createTmaSessionToken,
  hashWebPassword,
  passwordStamp,
  readTmaSessionToken,
  TMA_SESSION_MAX_AGE_SECONDS,
  verifyWebPassword,
} from "@/lib/tma/web-session";

const SECRET = "desk-session-secret-for-tests";

describe("web passwords", () => {
  it("accepts the password that was set and refuses any other", () => {
    const stored = hashWebPassword("Флоры-за-столом");

    expect(verifyWebPassword("Флоры-за-столом", stored)).toBe(true);
    expect(verifyWebPassword("флоры-за-столом", stored)).toBe(false);
  });

  // A fresh salt every time is what makes setting the same word again close old desks.
  it("stamps the same word set twice differently", () => {
    expect(passwordStamp(hashWebPassword("same-word-1"))).not.toBe(passwordStamp(hashWebPassword("same-word-1")));
  });

  it("refuses a stored value it cannot read", () => {
    expect(verifyWebPassword("anything", "plain-text")).toBe(false);
  });
});

describe("desk session token", () => {
  const passwordHash = hashWebPassword("dealer-password");

  it("reads back the role and the password it was opened with", () => {
    const token = createTmaSessionToken({ passwordHash, role: "dealer" }, SECRET);

    expect(readTmaSessionToken(token, SECRET)).toEqual({ role: "dealer", stamp: passwordStamp(passwordHash) });
  });

  it("expires after thirty days", () => {
    const openedAt = new Date("2026-10-01T10:00:00.000Z");
    const token = createTmaSessionToken({ passwordHash, role: "dealer" }, SECRET, openedAt);
    const later = new Date(openedAt.getTime() + (TMA_SESSION_MAX_AGE_SECONDS + 1) * 1000);

    expect(readTmaSessionToken(token, SECRET, later)).toBeNull();
  });

  it("refuses a token signed with another secret", () => {
    const token = createTmaSessionToken({ passwordHash, role: "floor" }, "another-secret-entirely");

    expect(readTmaSessionToken(token, SECRET)).toBeNull();
  });

  // Both are signed with SESSION_SECRET; the label keeps a player's cookie out of the desk.
  it("refuses a player's web session cookie", () => {
    const playerToken = createSessionToken("account-1", SECRET);

    expect(readTmaSessionToken(playerToken, SECRET)).toBeNull();
  });
});
