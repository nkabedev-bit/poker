import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "desk-session-secret-for-tests";

const mocks = vi.hoisted(() => ({
  admin: null as null | { name: string; role?: string | null; telegram_id: number },
  passwords: {} as Record<string, string>,
  userId: 42 as number | undefined,
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://db.test",
    SESSION_SECRET: SECRET,
    SUPABASE_SERVICE_ROLE_KEY: "service",
  }),
}));

vi.mock("@/lib/tma/auth", () => ({
  validateInitData: () => ({ ok: mocks.userId !== undefined, userId: mocks.userId }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, value: unknown) => ({
          maybeSingle: async () => ({
            data:
              table === "tma_admins"
                ? mocks.admin
                : mocks.passwords[String(value)]
                  ? { password_hash: mocks.passwords[String(value)] }
                  : null,
          }),
        }),
      }),
    }),
  }),
}));

import { requireTmaAuth } from "@/lib/tma/require-auth";
import { createTmaSessionToken, hashWebPassword } from "@/lib/tma/web-session";

function telegramRequest() {
  return new Request("https://club.test/api/tma/cards", {
    headers: { "X-Telegram-Init-Data": "signed" },
  });
}

function browserRequest(cookie: string) {
  // The desk in a browser sends the header empty: there is no Telegram to fill it.
  return new Request("https://club.test/api/tma/cards", {
    headers: { cookie: `other=1; tma_session=${cookie}`, "X-Telegram-Init-Data": "" },
  });
}

async function signIn(role: "dealer" | "floor") {
  const passwordHash = hashWebPassword(`${role}-password`);
  mocks.passwords[role] = passwordHash;
  return createTmaSessionToken({ passwordHash, role }, SECRET);
}

describe("requireTmaAuth inside Telegram", () => {
  beforeEach(() => {
    mocks.userId = 42;
    mocks.admin = { name: "Аня", role: "dealer", telegram_id: 42 };
  });

  it("lets a dealer work the tables", async () => {
    const auth = await requireTmaAuth(telegramRequest());

    expect(auth.error).toBeUndefined();
    expect(auth).toMatchObject({ adminName: "Аня", role: "dealer", userId: 42 });
  });

  it("turns a dealer away from a floor's endpoint", async () => {
    const auth = await requireTmaAuth(telegramRequest(), { floorOnly: true });

    expect(auth.error?.status).toBe(403);
    await expect(auth.error?.json()).resolves.toEqual({ error: "Это доступно только флору" });
  });

  it("opens a floor's endpoint to a floor", async () => {
    mocks.admin = { name: "Борис", role: "floor", telegram_id: 42 };

    const auth = await requireTmaAuth(telegramRequest(), { floorOnly: true });

    expect(auth).toMatchObject({ role: "floor" });
  });

  // The two who run the staff keep the whole desk whatever the table says.
  it("treats an access manager as a floor even when stored as a dealer", async () => {
    mocks.userId = 511564749;
    mocks.admin = { name: "Никита", role: "dealer", telegram_id: 511564749 };

    const auth = await requireTmaAuth(telegramRequest(), { floorOnly: true });

    expect(auth).toMatchObject({ role: "floor" });
  });

  it("refuses someone who is not an admin at all", async () => {
    mocks.admin = null;

    const auth = await requireTmaAuth(telegramRequest());

    expect(auth.error?.status).toBe(403);
  });

  it("refuses a request with neither Telegram's signature nor a desk cookie", async () => {
    const auth = await requireTmaAuth(new Request("https://club.test/api/tma/cards"));

    expect(auth.error?.status).toBe(401);
  });
});

describe("requireTmaAuth in a browser", () => {
  beforeEach(() => {
    mocks.passwords = {};
    mocks.admin = null;
  });

  it("opens the desk for the role the password gave", async () => {
    const cookie = await signIn("floor");

    const auth = await requireTmaAuth(browserRequest(cookie), { floorOnly: true });

    expect(auth).toMatchObject({ adminName: "Браузер · флор", role: "floor", userId: null });
  });

  it("keeps a dealer's browser desk off a floor's endpoint", async () => {
    const cookie = await signIn("dealer");

    const auth = await requireTmaAuth(browserRequest(cookie), { floorOnly: true });

    expect(auth.error?.status).toBe(403);
  });

  // A new password is how a dealer who left loses the browser desk.
  it("closes desks opened with a password that has since changed", async () => {
    const cookie = await signIn("dealer");
    mocks.passwords.dealer = hashWebPassword("dealer-password");

    const auth = await requireTmaAuth(browserRequest(cookie));

    expect(auth.error?.status).toBe(401);
    await expect(auth.error?.json()).resolves.toEqual({ error: "Пароль сменили — войдите заново" });
  });

  it("refuses a cookie someone edited", async () => {
    const cookie = await signIn("dealer");
    const [body, signature] = cookie.split(".");
    const edited = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), role: "floor" }),
    ).toString("base64url");

    const auth = await requireTmaAuth(browserRequest(`${edited}.${signature}`));

    expect(auth.error?.status).toBe(401);
  });
});
