import { describe, expect, it } from "vitest";
import { countFreePasses, loadPassHolds, type PassHold } from "@/lib/free-entries/holds";

// 15:00 in Moscow.
const NOW = new Date("2026-09-14T12:00:00.000Z");

function hold(overrides: Partial<PassHold> = {}): PassHold {
  return {
    eventId: "event-phoenix",
    pass: "regular",
    startsAt: "2026-09-15T16:00:00.000Z",
    title: "Phoenix",
    ...overrides,
  };
}

/** Answers the one query loadPassHolds makes with the rows given. */
function supabaseReturning(rows: Array<Record<string, unknown>>) {
  const query = {
    eq: () => query,
    in: () => query,
    select: () => query,
    then: (resolve: (result: { data: unknown; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };

  return { from: () => query } as never;
}

function signupFor(event: Record<string, unknown>, pass = "regular") {
  return { tournament_events: { late_entry_until: null, ...event }, use_pass: pass };
}

describe("countFreePasses", () => {
  it("takes a pass promised to another game out of what is left", () => {
    const passes = countFreePasses({ free_entries: 1, vip_free_entries: 0 }, [hold()]);

    expect(passes.regular).toBe(0);
    expect(passes.heldFor).toEqual([hold()]);
  });

  it("keeps a second pass free for a second game", () => {
    const passes = countFreePasses({ free_entries: 2 }, [hold()]);

    expect(passes.regular).toBe(1);
  });

  it("counts a VIP pass apart from a regular one", () => {
    const passes = countFreePasses({ free_entries: 1, vip_free_entries: 1 }, [hold({ pass: "vip" })]);

    expect(passes).toMatchObject({ regular: 1, vip: 0 });
  });

  // Sending the sign-up again must not trip over the pass it already holds.
  it("leaves out the game being signed up for", () => {
    const passes = countFreePasses({ free_entries: 1 }, [hold()], "event-phoenix");

    expect(passes.regular).toBe(1);
    expect(passes.heldFor).toEqual([]);
  });

  it("stays at zero when the club took a promised pass back", () => {
    const passes = countFreePasses({ free_entries: 0 }, [hold()]);

    expect(passes.regular).toBe(0);
  });
});

describe("loadPassHolds", () => {
  it("lists the games still ahead, soonest first", async () => {
    const supabase = supabaseReturning([
      signupFor(
        { id: "event-mystery", starts_at: "2026-09-20T14:00:00.000Z", title: "Mystery Bounty" },
        "vip",
      ),
      signupFor({ id: "event-phoenix", starts_at: "2026-09-15T16:00:00.000Z", title: "Phoenix" }),
    ]);

    const holds = await loadPassHolds(supabase, "account-1", NOW);

    expect(holds.map((item) => item.title)).toEqual(["Phoenix", "Mystery Bounty"]);
    expect(holds[1]).toMatchObject({ eventId: "event-mystery", pass: "vip" });
  });

  // The night ending without the player gives the pass back, with nobody returning it.
  it("lets go of a pass once its evening is over", async () => {
    const supabase = supabaseReturning([
      signupFor({ id: "event-freeroll", starts_at: "2026-09-13T16:00:00.000Z", title: "Freeroll" }),
    ]);

    const holds = await loadPassHolds(supabase, "account-1", NOW);

    expect(holds).toEqual([]);
  });

  // Late entry has closed, but the player may still walk in and be seated tonight.
  it("keeps holding it through the evening being played", async () => {
    const supabase = supabaseReturning([
      signupFor({
        id: "event-daytime",
        late_entry_until: "2026-09-14T11:00:00.000Z",
        starts_at: "2026-09-14T10:00:00.000Z",
        title: "Daytime Deep Stack",
      }),
    ]);

    const holds = await loadPassHolds(supabase, "account-1", NOW);

    expect(holds).toHaveLength(1);
  });
});
