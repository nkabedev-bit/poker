import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: null as null | { name: string; role?: string | null; telegram_id: number },
  userId: 42 as number | undefined,
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }),
}));

vi.mock("@/lib/tma/auth", () => ({
  validateInitData: () => ({ ok: mocks.userId !== undefined, userId: mocks.userId }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.admin }) }),
      }),
    }),
  }),
}));

import { requireTmaAuth } from "@/lib/tma/require-auth";

function deskRequest() {
  return new Request("https://club.test/api/tma/cards", {
    headers: { "X-Telegram-Init-Data": "signed" },
  });
}

describe("requireTmaAuth", () => {
  beforeEach(() => {
    mocks.userId = 42;
    mocks.admin = { name: "Аня", role: "dealer", telegram_id: 42 };
  });

  it("lets a dealer work the tables", async () => {
    const auth = await requireTmaAuth(deskRequest());

    expect(auth.error).toBeUndefined();
    expect(auth).toMatchObject({ adminName: "Аня", role: "dealer", userId: 42 });
  });

  it("turns a dealer away from a floor's endpoint", async () => {
    const auth = await requireTmaAuth(deskRequest(), { floorOnly: true });

    expect(auth.error?.status).toBe(403);
    await expect(auth.error?.json()).resolves.toEqual({ error: "Это доступно только флору" });
  });

  it("opens a floor's endpoint to a floor", async () => {
    mocks.admin = { name: "Борис", role: "floor", telegram_id: 42 };

    const auth = await requireTmaAuth(deskRequest(), { floorOnly: true });

    expect(auth.error).toBeUndefined();
    expect(auth.role).toBe("floor");
  });

  // The two who run the staff keep the whole desk whatever the table says.
  it("treats an access manager as a floor even when stored as a dealer", async () => {
    mocks.userId = 511564749;
    mocks.admin = { name: "Никита", role: "dealer", telegram_id: 511564749 };

    const auth = await requireTmaAuth(deskRequest(), { floorOnly: true });

    expect(auth.error).toBeUndefined();
    expect(auth.role).toBe("floor");
  });

  it("refuses someone who is not an admin at all", async () => {
    mocks.admin = null;

    const auth = await requireTmaAuth(deskRequest());

    expect(auth.error?.status).toBe(403);
  });

  it("refuses a request without Telegram's signature", async () => {
    const auth = await requireTmaAuth(new Request("https://club.test/api/tma/cards"));

    expect(auth.error?.status).toBe(401);
  });
});
