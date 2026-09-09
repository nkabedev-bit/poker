import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  syncClientBotAvatar: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/client-bot/avatar", () => ({ syncClientBotAvatar: mocks.syncClientBotAvatar }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

/** Records the filters the route asks for, and hands back one page of players. */
function createSupabaseMock(players: number[], total = players.length) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query: Record<string, unknown> = {};

  for (const method of ["select", "eq", "order", "or", "is"]) {
    query[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    });
  }
  query.limit = vi.fn(async () => ({
    count: total,
    data: players.map((telegram_id) => ({ telegram_id })),
    error: null,
  }));

  return {
    calls,
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "admin" } } })) },
      from: vi.fn(() => query),
    },
  };
}

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/sync-avatars", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/admin/sync-avatars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLIENT_TELEGRAM_BOT_TOKEN = "test-token";
    mocks.syncClientBotAvatar.mockResolvedValue("https://club.example/faces/1.jpg");
  });

  it("takes only the players with no photo yet", async () => {
    const { calls, client } = createSupabaseMock([1, 2]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const { POST } = await import("@/app/api/admin/sync-avatars/route");
    const body = await (await POST(request({}))).json();

    expect(calls.some(({ method, args }) => method === "is" && args[0] === "avatar_url")).toBe(true);
    expect(body).toMatchObject({ processed: 2, updated: 2 });
  });

  // Nothing about a player changes to take them out of a forced batch, so without a
  // window the run hands back the same twenty for ever and never reaches the roster's end.
  it("skips whoever was refreshed this hour, so a forced run walks the whole roster", async () => {
    const { calls, client } = createSupabaseMock([3], 90);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const { POST } = await import("@/app/api/admin/sync-avatars/route");
    const body = await (await POST(request({ force: true }))).json();

    const filter = calls.find(({ method }) => method === "or");
    expect(String(filter?.args[0])).toContain("avatar_synced_at");
    expect(calls.some(({ method, args }) => method === "is" && args[0] === "avatar_url")).toBe(false);
    // The count is of stale players, so it falls as batches stamp what they touched.
    expect(body.remaining).toBe(89);
  });

  it("counts a player whose photo Telegram will not give up", async () => {
    const { client } = createSupabaseMock([4, 5]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    mocks.syncClientBotAvatar.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("нет"));

    const { POST } = await import("@/app/api/admin/sync-avatars/route");
    const body = await (await POST(request({}))).json();

    expect(body).toMatchObject({ processed: 2, updated: 0, withoutPhoto: 2 });
  });
});
