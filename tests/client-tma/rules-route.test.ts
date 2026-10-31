import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireClientTmaAuth: vi.fn() }));

vi.mock("@/lib/client-tma/require-auth", () => ({ requireClientTmaAuth: mocks.requireClientTmaAuth }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

/** The accounts table, recording what the route writes to it and for whom. */
function accountsSpy(error: { message: string } | null = null) {
  const writes: Array<{ id: unknown; values: Record<string, unknown> }> = [];
  const supabase = {
    from: vi.fn(() => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, id: unknown) => {
          writes.push({ id, values });
          return { error };
        },
      }),
    })),
  };

  return { supabase, writes };
}

async function acceptRules() {
  const { POST } = await import("@/app/api/client-tma/rules/route");
  return POST(new Request("http://localhost/api/client-tma/rules", { method: "POST" }));
}

describe("agreeing to the club's rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("stores when the player agreed", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: { id: "account-me" } });

    const response = await acceptRules();
    const body = (await response.json()) as { acceptedAt: string };

    expect(response.status).toBe(200);
    expect(writes).toEqual([{ id: "account-me", values: { rules_accepted_at: body.acceptedAt } }]);
  });

  it("says so when the migration is not applied yet", async () => {
    const { supabase } = accountsSpy({ message: 'column "rules_accepted_at" does not exist' });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: { id: "account-me" } });

    const response = await acceptRules();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "not_ready" });
  });

  it("turns away somebody who is not signed in", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({ error: Response.json({}, { status: 401 }) });

    const response = await acceptRules();

    expect(response.status).toBe(401);
  });
});
