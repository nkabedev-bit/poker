import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventInputError } from "@/lib/events/input";
import {
  announcePublishedEvents,
  loadPublishTimes,
  publishDueEvents,
  savePublishAt,
} from "@/lib/events/scheduled-publication";

const mocks = vi.hoisted(() => ({ notifyReservedOnPublish: vi.fn() }));

vi.mock("@/lib/events/reservations", () => ({
  notifyReservedOnPublish: mocks.notifyReservedOnPublish,
}));

const NOW = new Date("2026-09-15T07:00:00.000Z");

const MISSING_COLUMN = {
  code: "42703",
  message: "column tournament_events.publish_at does not exist",
};

/** One query against tournament_events, answered with the result given; calls are kept. */
function tableAnswering(result: { data?: unknown; error?: unknown } = {}) {
  const calls: Array<[string, unknown[]]> = [];
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: result.data ?? null, error: result.error ?? null }),
  };

  for (const method of ["eq", "in", "lte", "not", "select", "update"]) {
    query[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return query;
    };
  }

  const from = vi.fn(() => query);
  return { calls, from, supabase: { from } as never };
}

describe("publishDueEvents", () => {
  it("puts up the drafts whose time has come and names them", async () => {
    const { calls, supabase } = tableAnswering({ data: [{ id: "event-phoenix" }] });

    const published = await publishDueEvents(supabase, NOW);

    expect(published).toEqual(["event-phoenix"]);
    expect(calls).toContainEqual(["update", [{ is_published: true, publish_at: null }]]);
    expect(calls).toContainEqual(["eq", ["is_published", false]]);
    expect(calls).toContainEqual(["lte", ["publish_at", NOW.toISOString()]]);
  });

  // Deployed ahead of the migration, the posters must keep working.
  it("stays quiet until the migration adds the column", async () => {
    const { supabase } = tableAnswering({ error: MISSING_COLUMN });

    const published = await publishDueEvents(supabase, NOW);

    expect(published).toEqual([]);
  });

  it("passes any other failure on", async () => {
    const { supabase } = tableAnswering({ error: { code: "57014", message: "timeout" } });

    await expect(publishDueEvents(supabase, NOW)).rejects.toMatchObject({ code: "57014" });
  });
});

describe("announcePublishedEvents", () => {
  beforeEach(() => {
    mocks.notifyReservedOnPublish.mockReset();
  });

  it("tells the held tickets of every poster that went up", async () => {
    mocks.notifyReservedOnPublish.mockResolvedValue(1);

    await announcePublishedEvents({} as never, ["event-phoenix", "event-mystery"]);

    expect(mocks.notifyReservedOnPublish).toHaveBeenCalledTimes(2);
    expect(mocks.notifyReservedOnPublish).toHaveBeenLastCalledWith({}, "event-mystery");
  });

  it("keeps announcing after one poster's messages fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.notifyReservedOnPublish.mockRejectedValueOnce(new Error("bot down")).mockResolvedValue(1);

    await announcePublishedEvents({} as never, ["event-phoenix", "event-mystery"]);

    expect(mocks.notifyReservedOnPublish).toHaveBeenLastCalledWith({}, "event-mystery");
  });
});

describe("loadPublishTimes", () => {
  it("reads the times of the scheduled drafts by poster", async () => {
    const { supabase } = tableAnswering({
      data: [{ id: "event-phoenix", publish_at: "2026-09-15T07:00:00+00:00" }],
    });

    const times = await loadPublishTimes(supabase, ["event-phoenix", "event-freeroll"]);

    expect(Object.fromEntries(times)).toEqual({ "event-phoenix": "2026-09-15T07:00:00+00:00" });
  });

  it("asks nothing when there are no posters", async () => {
    const { from, supabase } = tableAnswering();

    const times = await loadPublishTimes(supabase, []);

    expect(times.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("reads no times until the migration adds the column", async () => {
    const { supabase } = tableAnswering({ error: MISSING_COLUMN });

    const times = await loadPublishTimes(supabase, ["event-phoenix"]);

    expect(times.size).toBe(0);
  });
});

describe("savePublishAt", () => {
  const missingOnWrite = {
    code: "PGRST204",
    message: "Could not find the 'publish_at' column of 'tournament_events' in the schema cache",
  };

  // The poster itself is saved; the admin has to hear that it will not go up on its own.
  it("tells the admin a time cannot be kept before the migration", async () => {
    const { supabase } = tableAnswering({ error: missingOnWrite });

    await expect(savePublishAt(supabase, "event-phoenix", NOW.toISOString())).rejects.toBeInstanceOf(
      EventInputError,
    );
  });

  it("clears nothing quietly before the migration", async () => {
    const { supabase } = tableAnswering({ error: missingOnWrite });

    await expect(savePublishAt(supabase, "event-phoenix", null)).resolves.toBeUndefined();
  });

  it("writes the time onto the poster", async () => {
    const { calls, supabase } = tableAnswering();

    await savePublishAt(supabase, "event-phoenix", NOW.toISOString());

    expect(calls).toContainEqual(["update", [{ publish_at: NOW.toISOString() }]]);
    expect(calls).toContainEqual(["eq", ["id", "event-phoenix"]]);
  });
});
