import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicState, loadPublicStateVersion } from "@/lib/public-state";

const mocks = vi.hoisted(() => ({ adminClient: null as unknown }));

vi.mock("@/lib/env", () => ({ hasPublicEnv: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => mocks.adminClient }));

type Row = {
  blind_levels: Array<{ updated_at: string }> | null;
  timer_state: { updated_at: string } | Array<{ updated_at: string }> | null;
  tournament_extras: { updated_at: string } | Array<{ updated_at: string }> | null;
  updated_at: string;
};

const ROW: Row = {
  blind_levels: [{ updated_at: "2026-09-11T10:00:00Z" }, { updated_at: "2026-09-11T11:00:00Z" }],
  timer_state: { updated_at: "2026-09-11T19:00:00Z" },
  tournament_extras: { updated_at: "2026-09-11T19:05:00Z" },
  updated_at: "2026-09-01T12:00:00Z",
};

function supabaseAnswering(data: Row | null, error: { message: string } | null = null) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
    select: vi.fn(() => query),
  };

  return { client: { from: vi.fn(() => query) } as unknown as SupabaseClient, query };
}

describe("loadPublicStateVersion", () => {
  it("reads the screen's stamps by its token", async () => {
    const { client, query } = supabaseAnswering(ROW);

    await loadPublicStateVersion(client, "token-1");

    expect(client.from).toHaveBeenCalledWith("tournaments");
    expect(query.eq).toHaveBeenCalledWith("public_token", "token-1");
  });

  it("stays the same while nothing changes", async () => {
    const first = await loadPublicStateVersion(supabaseAnswering(ROW).client, "token-1");
    const second = await loadPublicStateVersion(supabaseAnswering({ ...ROW }).client, "token-1");

    expect(first).toBe(second);
  });

  // A knockout, a rebuy and a draw all land in the extras.
  it("moves when the roster or the draw is written", async () => {
    const before = await loadPublicStateVersion(supabaseAnswering(ROW).client, "token-1");
    const after = await loadPublicStateVersion(
      supabaseAnswering({ ...ROW, tournament_extras: { updated_at: "2026-09-11T19:06:00Z" } })
        .client,
      "token-1",
    );

    expect(after).not.toBe(before);
  });

  it("moves when the clock is paused or a level changes", async () => {
    const before = await loadPublicStateVersion(supabaseAnswering(ROW).client, "token-1");
    const after = await loadPublicStateVersion(
      supabaseAnswering({ ...ROW, timer_state: [{ updated_at: "2026-09-11T19:10:00Z" }] }).client,
      "token-1",
    );

    expect(after).not.toBe(before);
  });

  // Deleting a level leaves no stamp behind; the count is what moves.
  it("moves when a blind level is taken away", async () => {
    const before = await loadPublicStateVersion(supabaseAnswering(ROW).client, "token-1");
    const after = await loadPublicStateVersion(
      supabaseAnswering({ ...ROW, blind_levels: [{ updated_at: "2026-09-11T11:00:00Z" }] }).client,
      "token-1",
    );

    expect(after).not.toBe(before);
  });

  it("has no version for a screen that does not exist", async () => {
    expect(await loadPublicStateVersion(supabaseAnswering(null).client, "nope")).toBeNull();
  });

  it("fails loudly when the database refuses", async () => {
    await expect(
      loadPublicStateVersion(supabaseAnswering(null, { message: "boom" }).client, "token-1"),
    ).rejects.toThrow("boom");
  });
});

describe("loadPublicState — the fingerprint it was read at", () => {
  function adminClient(versionAnswer: { data: Row | null; error: { message: string } | null }) {
    const calls: string[] = [];
    const query = (table: string) => {
      const chain = {
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          calls.push(table);
          return table === "tournaments" ? versionAnswer : { data: { data: {} }, error: null };
        }),
        select: vi.fn(() => chain),
      };
      return chain;
    };

    return {
      calls,
      client: {
        from: vi.fn((table: string) => query(table)),
        rpc: vi.fn(async () => {
          calls.push("get_public_state");
          return {
            data: {
              blindLevels: [],
              timerState: {
                current_level_index: 0,
                finished_at: null,
                level_started_at: null,
                paused_remaining_seconds: null,
                registration_closes_at: null,
                status: "running",
              },
              tournament: {
                id: "t1",
                logo_url: null,
                name: "Турнир",
                public_token: "token-1",
                registration_minutes: 0,
                registration_status: "open",
                starting_stack: 20000,
              },
            },
            error: null,
          };
        }),
      },
    };
  }

  // Read the other way round, a write landing in between would leave the screen sure it
  // already had a change it never got.
  it("reads the fingerprint before the state and hands it over with it", async () => {
    const admin = adminClient({ data: ROW, error: null });
    mocks.adminClient = admin.client;

    const state = await loadPublicState("token-1");

    expect(admin.calls.indexOf("tournaments")).toBeLessThan(admin.calls.indexOf("get_public_state"));
    expect(state?.version).toBe(await loadPublicStateVersion(supabaseAnswering(ROW).client, "t"));
  });

  it("still shows the screen when the fingerprint cannot be read", async () => {
    mocks.adminClient = adminClient({ data: null, error: { message: "boom" } }).client;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await loadPublicState("token-1");

    expect(state?.tournament.name).toBe("Турнир");
    expect(state?.version).toBeUndefined();
    error.mockRestore();
  });
});
