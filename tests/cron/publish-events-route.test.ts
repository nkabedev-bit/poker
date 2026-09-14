import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  announcePublishedEvents: vi.fn(),
  createClient: vi.fn(),
  getServerEnv: vi.fn(),
  publishDueEvents: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

vi.mock("@/lib/events/scheduled-publication", () => ({
  announcePublishedEvents: mocks.announcePublishedEvents,
  publishDueEvents: mocks.publishDueEvents,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const ENV = {
  CRON_SECRET: "tick-secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://db.example",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

async function tick(authorization?: string) {
  const { POST } = await import("@/app/api/cron/publish-events/route");

  return POST(
    new Request("http://localhost/api/cron/publish-events", {
      headers: authorization ? { authorization } : {},
      method: "POST",
    }),
  );
}

describe("the scheduled poster tick", () => {
  const database = { name: "service client" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue(ENV);
    mocks.createClient.mockReturnValue(database);
    mocks.publishDueEvents.mockResolvedValue(["event-phoenix"]);
    mocks.announcePublishedEvents.mockResolvedValue(undefined);
  });

  it("turns away a caller without the cron secret", async () => {
    const response = await tick("Bearer guessed");

    expect(response.status).toBe(401);
    expect(mocks.publishDueEvents).not.toHaveBeenCalled();
  });

  it("puts up the due drafts and announces their held tickets", async () => {
    const response = await tick("Bearer tick-secret");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ published: 1 });
    expect(mocks.announcePublishedEvents).toHaveBeenCalledWith(database, ["event-phoenix"]);
  });

  it("does nothing while the secret is not configured", async () => {
    mocks.getServerEnv.mockReturnValue({ ...ENV, CRON_SECRET: "" });

    const response = await tick("Bearer ");

    expect(response.status).toBe(503);
    expect(mocks.publishDueEvents).not.toHaveBeenCalled();
  });
});
