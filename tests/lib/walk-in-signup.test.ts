import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markTonightSignupSeated } from "@/lib/events/store";

const TONIGHT = new Date("2026-09-08T19:00:00.000Z");

/**
 * The desk, as the database answers it: the published posters, and the sign-up rows an
 * update can still reach.
 */
function supabaseStub({
  events = [{ id: "event-1", starts_at: TONIGHT.toISOString(), title: "ЧЕТВЕРГОВЫЙ" }],
  updated = [{ id: "signup-1" }],
}: {
  events?: Array<Record<string, unknown>>;
  updated?: Array<Record<string, unknown>>;
} = {}) {
  const update = vi.fn();
  const filters: Array<[string, unknown, unknown]> = [];

  const from = vi.fn((table: string) => {
    if (table === "tournament_events") {
      const chain: Record<string, unknown> = {
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: events, error: null }).then(resolve),
      };
      for (const link of ["eq", "order"]) chain[link] = vi.fn(() => chain);

      return { select: vi.fn(() => chain) };
    }

    const chain: Record<string, unknown> = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push(["eq", column, value]);
        return chain;
      }),
      in: vi.fn((column: string, value: unknown) => {
        filters.push(["in", column, value]);
        return chain;
      }),
      select: vi.fn(async () => ({ data: updated, error: null })),
    };

    return {
      update: vi.fn((payload: unknown) => {
        update(payload);
        return chain;
      }),
    };
  });

  return { filters, from, supabase: { from } as unknown as SupabaseClient, update };
}

/**
 * A guest can reach a chair without their own sign-up ever being touched: the queue had
 * nobody to give a place to, so the desk typed them in by hand. Their evening counted
 * and their achievements were credited, while the queue went on showing them as waiting
 * outside — which is exactly what happened to the player this was written for.
 */
describe("closing the sign-up of a walk-in the desk typed in", () => {
  it("takes a player out of tonight's queue once they are at a table", async () => {
    const { filters, supabase, update } = supabaseStub();

    const closed = await markTonightSignupSeated(supabase, "account-1", TONIGHT);

    expect(closed).toBe(true);
    expect(update).toHaveBeenCalledWith({ status: "seated" });
    expect(filters).toContainEqual(["eq", "event_id", "event-1"]);
    expect(filters).toContainEqual(["eq", "user_id", "account-1"]);
  });

  // A cancelled sign-up stays cancelled, and a no-show is not brought back to life by a
  // namesake sitting down at a table.
  it("only reaches a row that is still waiting for something", async () => {
    const { filters, supabase } = supabaseStub();

    await markTonightSignupSeated(supabase, "account-1", TONIGHT);

    expect(filters).toContainEqual(["in", "status", ["waitlist", "signed_up", "reserved"]]);
  });

  it("says so when the player had no row to close", async () => {
    const { supabase } = supabaseStub({ updated: [] });

    await expect(markTonightSignupSeated(supabase, "account-1", TONIGHT)).resolves.toBe(false);
  });

  // Tonight's game is the only one a walk-in can be sitting at: a Thursday sign-up is
  // still a Thursday sign-up.
  it("touches nothing when no game is being played tonight", async () => {
    const { supabase, update } = supabaseStub({
      events: [{ id: "event-2", starts_at: "2026-09-20T19:00:00.000Z", title: "ВОСКРЕСНЫЙ" }],
    });

    await expect(markTonightSignupSeated(supabase, "account-1", TONIGHT)).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
