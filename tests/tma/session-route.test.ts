import { beforeAll, describe, expect, it, vi } from "vitest";
import { hashWebPassword, readTmaSessionToken } from "@/lib/tma/web-session";

const SECRET = "desk-session-secret-for-tests";

const mocks = vi.hoisted(() => ({ rows: [] as Array<{ password_hash: string; role: string }> }));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://db.test",
    SESSION_SECRET: SECRET,
    SUPABASE_SERVICE_ROLE_KEY: "service",
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: async () => ({ data: mocks.rows, error: null }) }),
  }),
}));

import { DELETE, POST } from "@/app/api/tma/session/route";

function signIn(password: string, address: string) {
  return POST(
    new Request("https://club.test/api/tma/session", {
      body: JSON.stringify({ password }),
      headers: { "Content-Type": "application/json", "x-forwarded-for": address },
      method: "POST",
    }),
  );
}

function deskCookie(response: Response) {
  const header = response.headers.get("set-cookie") ?? "";
  return header.match(/tma_session=([^;]*)/)?.[1] ?? "";
}

describe("POST /api/tma/session", () => {
  beforeAll(() => {
    mocks.rows = [
      { password_hash: hashWebPassword("floor-password"), role: "floor" },
      { password_hash: hashWebPassword("dealer-password"), role: "dealer" },
    ];
  });

  it("opens the desk as a dealer with the dealers' password", async () => {
    const response = await signIn("dealer-password", "10.0.0.1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ role: "dealer" });
    expect(readTmaSessionToken(deskCookie(response), SECRET)?.role).toBe("dealer");
  });

  it("keeps the cookie away from scripts and other sites", async () => {
    const response = await signIn("floor-password", "10.0.0.2");
    const header = response.headers.get("set-cookie") ?? "";

    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=strict/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/Max-Age=2592000/);
  });

  it("refuses a wrong password without a cookie", async () => {
    const response = await signIn("guess", "10.0.0.3");

    expect(response.status).toBe(401);
    expect(deskCookie(response)).toBe("");
  });

  it("closes the door after five wrong passwords, even for the right one", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signIn(`guess-${attempt}`, "10.0.0.4");
    }

    const response = await signIn("floor-password", "10.0.0.4");

    expect(response.status).toBe(429);
  });

  it("does not hold one phone's misses against another", async () => {
    const response = await signIn("floor-password", "10.0.0.5");

    expect(response.status).toBe(200);
  });
});

describe("DELETE /api/tma/session", () => {
  it("clears the desk cookie", async () => {
    const response = await DELETE();

    expect(response.headers.get("set-cookie")).toMatch(/tma_session=;.*Max-Age=0/);
  });
});
