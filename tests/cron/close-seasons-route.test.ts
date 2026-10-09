import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapSeasonRow } from "@/lib/seasons/season";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  freezeAndCloseSeason: vi.fn(),
  getServerEnv: vi.fn(),
  listSeasons: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

vi.mock("@/lib/seasons/store", () => ({
  freezeAndCloseSeason: mocks.freezeAndCloseSeason,
  listSeasons: mocks.listSeasons,
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

function season(overrides: Record<string, unknown>) {
  return mapSeasonRow({
    counted_games: 5,
    ends_on: null,
    parallel: true,
    starts_on: "2026-09-15",
    status: "open",
    ...overrides,
  });
}

const apc = season({ ends_on: "2026-10-07", id: "apc", title: "Отбор на кубок APC" });
const sochi = season({ ends_on: "2026-11-11", id: "sochi", starts_on: "2026-10-11", title: "Отбор в Сочи" });
const autumn = season({ id: "autumn", parallel: false, starts_on: "2026-09-01", title: "Autumn" });

async function tick(authorization?: string) {
  const { POST } = await import("@/app/api/cron/close-seasons/route");

  return POST(
    new Request("http://localhost/api/cron/close-seasons", {
      headers: authorization ? { authorization } : {},
      method: "POST",
    }),
  );
}

describe("the noon tick that closes finished seasons", () => {
  const database = { name: "service client" };

  beforeEach(() => {
    vi.clearAllMocks();
    // Noon in Moscow on 9 October: APC's last day was the 7th.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T09:00:00.000Z"));
    mocks.getServerEnv.mockReturnValue(ENV);
    mocks.createClient.mockReturnValue(database);
    mocks.listSeasons.mockResolvedValue([sochi, apc, autumn]);
    mocks.freezeAndCloseSeason.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("turns away a caller without the cron secret", async () => {
    const response = await tick("Bearer guessed");

    expect(response.status).toBe(401);
    expect(mocks.freezeAndCloseSeason).not.toHaveBeenCalled();
  });

  it("closes the season whose last day has passed, on that last day", async () => {
    const response = await tick("Bearer tick-secret");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ closed: ["Отбор на кубок APC"], failed: [] });
    expect(mocks.freezeAndCloseSeason).toHaveBeenCalledTimes(1);
    expect(mocks.freezeAndCloseSeason).toHaveBeenCalledWith(database, apc, "2026-10-07");
  });

  it("closes the others when one season cannot be frozen", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const winter = season({ ends_on: "2026-10-08", id: "winter", title: "Winter" });
    mocks.listSeasons.mockResolvedValue([winter, apc]);
    mocks.freezeAndCloseSeason.mockImplementation(async (_db: unknown, item: { id: string }) => {
      if (item.id === "winter") throw new Error("duplicate nickname");
    });

    const response = await tick("Bearer tick-secret");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ closed: ["Отбор на кубок APC"], failed: ["Winter"] });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
