import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDuoInviterName: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/events/duo", () => ({
  claimDuoInvite: vi.fn(),
  findDuoInviterName: mocks.findDuoInviterName,
}));

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const SUPABASE = {};

async function ask() {
  const { GET } = await import("@/app/api/client-tma/duo-invite/route");
  return GET(new Request("http://localhost/api/client-tma/duo-invite"));
}

describe("who asked the player along, for the questionnaire", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase: SUPABASE,
      user: { id: "account-newcomer", profile_submitted_at: null },
    });
  });

  it("names the member whose 1+1 link brought the newcomer in", async () => {
    mocks.findDuoInviterName.mockResolvedValue("TitAn");

    const response = await ask();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inviter: "TitAn" });
    expect(mocks.findDuoInviterName).toHaveBeenCalledWith(SUPABASE, "account-newcomer");
  });

  it("names nobody when nobody asked", async () => {
    mocks.findDuoInviterName.mockResolvedValue(null);

    const response = await ask();

    expect(await response.json()).toEqual({ inviter: null });
  });

  it("sends a visitor who has not signed in away without reading anything", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({
      error: Response.json({ error: "Not signed in" }, { status: 401 }),
    });

    const response = await ask();

    expect(response.status).toBe(401);
    expect(mocks.findDuoInviterName).not.toHaveBeenCalled();
  });
});
