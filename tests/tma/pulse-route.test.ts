import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireTmaAuth: vi.fn() }));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const { GET } = await import("@/app/api/tma/pulse/route");

type Tables = {
  signups: { count: number; latest: string | null; error?: unknown };
  tournament: Record<string, unknown> | null;
};

/** The club's tournament with its stamps, and the sign-ups' newest change and count. */
function database({ signups, tournament }: Tables) {
  return {
    from(table: string) {
      if (table === "tournaments") {
        const query = {
          limit: () => query,
          maybeSingle: async () => ({ data: tournament, error: null }),
          select: () => query,
        };
        return query;
      }

      const query = {
        limit: async () =>
          signups.error
            ? { count: null, data: null, error: signups.error }
            : {
                count: signups.count,
                data: signups.latest ? [{ updated_at: signups.latest }] : [],
                error: null,
              },
        order: () => query,
        select: () => query,
      };
      return query;
    },
  };
}

const TOURNAMENT = {
  blind_levels: [{ updated_at: "2026-09-25T18:00:00Z" }],
  timer_state: { updated_at: "2026-09-25T19:00:00Z" },
  tournament_extras: { updated_at: "2026-09-25T19:05:00Z" },
  updated_at: "2026-09-25T17:00:00Z",
};

async function pulse(tables: Tables) {
  mocks.requireTmaAuth.mockResolvedValue({ supabase: database(tables), userId: 1 });
  const response = await GET(new Request("http://localhost/api/tma/pulse"));
  return { body: (await response.json()) as { version?: string }, response };
}

describe("GET /api/tma/pulse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers with one fingerprint of the tournament and the sign-ups", async () => {
    const { body } = await pulse({
      signups: { count: 12, latest: "2026-09-25T16:00:00Z" },
      tournament: TOURNAMENT,
    });

    expect(body.version).toContain("2026-09-25T19:05:00Z");
    expect(body.version).toContain("12:2026-09-25T16:00:00Z");
  });

  // A player registered at the desk writes the roster into the tournament's extras.
  it("moves when the roster changes", async () => {
    const before = await pulse({ signups: { count: 0, latest: null }, tournament: TOURNAMENT });
    const after = await pulse({
      signups: { count: 0, latest: null },
      tournament: {
        ...TOURNAMENT,
        tournament_extras: { updated_at: "2026-09-25T19:06:00Z" },
      },
    });

    expect(after.body.version).not.toBe(before.body.version);
  });

  // A sign-up taken away leaves no newer stamp behind; the count still moves.
  it("moves when a sign-up disappears", async () => {
    const before = await pulse({ signups: { count: 5, latest: "2026-09-25T16:00:00Z" }, tournament: TOURNAMENT });
    const after = await pulse({ signups: { count: 4, latest: "2026-09-25T16:00:00Z" }, tournament: TOURNAMENT });

    expect(after.body.version).not.toBe(before.body.version);
  });

  it("says it could not tell rather than inventing a fingerprint", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { response } = await pulse({
      signups: { count: 0, error: { message: "timeout" }, latest: null },
      tournament: TOURNAMENT,
    });

    expect(response.status).toBe(500);
  });

  it("keeps the fingerprint to the desk", async () => {
    mocks.requireTmaAuth.mockResolvedValue({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(new Request("http://localhost/api/tma/pulse"));

    expect(response.status).toBe(401);
  });
});
