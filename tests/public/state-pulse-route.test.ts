import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasPublicEnv: vi.fn(),
  loadPublicStateVersion: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ hasPublicEnv: mocks.hasPublicEnv }));
vi.mock("@/lib/public-state", () => ({ loadPublicStateVersion: mocks.loadPublicStateVersion }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

async function ask(token: string) {
  const { GET } = await import("@/app/api/public-state/[token]/pulse/route");
  return GET(new Request(`http://localhost/api/public-state/${token}/pulse`), {
    params: Promise.resolve({ token }),
  });
}

describe("GET /api/public-state/[token]/pulse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPublicEnv.mockReturnValue(true);
  });

  it("answers with the screen's fingerprint, never from a cache", async () => {
    mocks.loadPublicStateVersion.mockResolvedValue("a|b|c|3:d");

    const response = await ask("token-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: "a|b|c|3:d" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.loadPublicStateVersion).toHaveBeenCalledWith(expect.anything(), "token-1");
  });

  it("answers 404 for a screen that does not exist", async () => {
    mocks.loadPublicStateVersion.mockResolvedValue(null);

    const response = await ask("nope");

    expect(response.status).toBe(404);
  });

  it("answers 500 when the database fails, so the screen tries again", async () => {
    mocks.loadPublicStateVersion.mockRejectedValue(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await ask("token-1");

    expect(response.status).toBe(500);
    error.mockRestore();
  });

  it("has nothing to answer without a Supabase project", async () => {
    mocks.hasPublicEnv.mockReturnValue(false);

    const response = await ask("demo");

    expect(response.status).toBe(404);
    expect(mocks.loadPublicStateVersion).not.toHaveBeenCalled();
  });
});
