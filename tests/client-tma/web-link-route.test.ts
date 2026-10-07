import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireClientTmaAuth = vi.fn();
vi.mock("@/lib/client-tma/require-auth", () => ({ requireClientTmaAuth }));

const { POST } = await import("@/app/api/client-tma/web-link/route");
const { readLinkToken } = await import("@/lib/auth/link-token");

const SECRET = "a-secret-of-sixteen-plus";

function ask(headers: Record<string, string> = {}) {
  return POST(new Request("https://club.example/api/client-tma/web-link", { method: "POST", headers }));
}

describe("POST /api/client-tma/web-link", () => {
  beforeEach(() => {
    requireClientTmaAuth.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://api.club.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("ADMIN_EMAIL", "admin@club.example");
    vi.stubEnv("SESSION_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gives a mini-app player a pass for their own profile", async () => {
    requireClientTmaAuth.mockResolvedValue({ userId: "acc-7", user: {}, supabase: {} });

    const response = await ask({ "X-Telegram-Init-Data": "signed" });
    const { token } = await response.json();

    expect(response.status).toBe(200);
    expect(readLinkToken(token, SECRET)).toBe("acc-7");
  });

  it("gives nothing to a web visitor, whom Telegram did not vouch for", async () => {
    const response = await ask();

    expect(response.status).toBe(403);
    expect(requireClientTmaAuth).not.toHaveBeenCalled();
  });

  it("passes a failed sign-in through", async () => {
    requireClientTmaAuth.mockResolvedValue({ error: Response.json({ error: "Invalid sign-in" }, { status: 401 }) });

    expect((await ask({ "X-Telegram-Init-Data": "forged" })).status).toBe(401);
  });
});
