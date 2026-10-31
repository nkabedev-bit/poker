import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventRow, type EventSignup } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  claimEventSignup: vi.fn(),
  getEvent: vi.fn(),
  getUserSignups: vi.fn(),
  loadPassHolds: vi.fn(),
}));

vi.mock("@/lib/events/store", () => ({
  getEvent: mocks.getEvent,
  getUserSignups: mocks.getUserSignups,
}));

vi.mock("@/lib/events/claim-signup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events/claim-signup")>()),
  claimEventSignup: mocks.claimEventSignup,
}));

// Which passes are promised elsewhere is read from the database; the counting stays real.
vi.mock("@/lib/free-entries/holds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/free-entries/holds")>()),
  loadPassHolds: mocks.loadPassHolds,
}));

import { switchSignupPass } from "@/lib/free-entries/switch-pass";

const NOW = new Date("2026-11-03T12:00:00.000Z");

const THURSDAY = mapEventRow({
  buy_in: 1500,
  id: "event-thu",
  is_published: true,
  late_entry_until: "2026-11-05T19:00:00.000Z",
  max_players: 30,
  starts_at: "2026-11-05T16:00:00.000Z",
  title: "Четверговый",
});

function signup(overrides: Partial<EventSignup> = {}): EventSignup {
  return {
    createdAt: "2026-11-02T09:00:00.000Z",
    duoConfirmedAt: null,
    duoHostUserId: null,
    duoInviteToken: null,
    duoPartnerName: null,
    duoPartnerUserId: null,
    eventId: "event-thu",
    id: "signup-1",
    notifiedAt: null,
    status: "signed_up",
    telegramId: 555,
    ticketType: "regular",
    userId: "user-1",
    usePass: "none",
    waitlistOfferExpiresAt: null,
    ...overrides,
  } as EventSignup;
}

/** Records the one plain update — letting a pass go — and its filters. */
function supabaseSpy() {
  const filters: Array<[string, unknown]> = [];
  const update = vi.fn(() => {
    const chain = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      }),
      then: (resolve: (result: { error: null }) => unknown) => resolve({ error: null }),
    };
    return chain;
  });

  return { filters, supabase: { from: vi.fn(() => ({ update })) } as never, update };
}

const ACCOUNT = { free_entries: 1, id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEvent.mockResolvedValue(THURSDAY);
  mocks.getUserSignups.mockResolvedValue([signup()]);
  mocks.loadPassHolds.mockResolvedValue([]);
  mocks.claimEventSignup.mockResolvedValue(null);
});

describe("switchSignupPass", () => {
  it("puts a regular ticket on a free pass without giving the seat back", async () => {
    const { supabase } = supabaseSpy();

    const outcome = await switchSignupPass(supabase, {
      account: ACCOUNT,
      eventId: "event-thu",
      now: NOW,
      usePass: "regular",
    });

    expect(outcome).toMatchObject({ ok: true, usePass: "regular" });
    expect(mocks.claimEventSignup).toHaveBeenCalledWith(supabase, expect.objectContaining({
      eventId: "event-thu",
      status: "signed_up",
      telegramId: 555,
      ticketType: "regular",
      usePass: "regular",
      userId: "user-1",
    }));
  });

  it("hands the pass back to the account by turning the ticket regular again", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ usePass: "regular" })]);
    const { filters, supabase, update } = supabaseSpy();

    const outcome = await switchSignupPass(supabase, {
      account: ACCOUNT,
      eventId: "event-thu",
      now: NOW,
      usePass: "none",
    });

    expect(outcome.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ use_pass: "none" });
    expect(filters).toEqual([
      ["event_id", "event-thu"],
      ["user_id", "user-1"],
      ["status", "signed_up"],
    ]);
    expect(mocks.claimEventSignup).not.toHaveBeenCalled();
  });

  it("names the game the only pass is already promised to", async () => {
    mocks.loadPassHolds.mockResolvedValue([
      { eventId: "event-tue", startsAt: "2026-11-04T16:00:00.000Z", title: "Вторник" },
    ]);

    const outcome = await switchSignupPass(supabaseSpy().supabase, {
      account: ACCOUNT,
      eventId: "event-thu",
      now: NOW,
      usePass: "regular",
    });

    expect(outcome).toMatchObject({ error: "pass_held", ok: false });
    expect(!outcome.ok && outcome.message).toContain("Вторник");
    expect(mocks.claimEventSignup).not.toHaveBeenCalled();
  });

  it("refuses without a pass on the account", async () => {
    const outcome = await switchSignupPass(supabaseSpy().supabase, {
      account: { free_entries: 0, id: "user-1" },
      eventId: "event-thu",
      now: NOW,
      usePass: "regular",
    });

    expect(outcome).toMatchObject({ error: "no_pass", ok: false });
  });

  it("leaves a seated player alone: they paid at the door already", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ status: "seated" })]);

    const outcome = await switchSignupPass(supabaseSpy().supabase, {
      account: ACCOUNT,
      eventId: "event-thu",
      now: NOW,
      usePass: "regular",
    });

    expect(outcome).toMatchObject({ error: "not_signed_up", ok: false });
  });

  it("never puts a pass on a 1+1", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ ticketType: "duo" })]);

    const outcome = await switchSignupPass(supabaseSpy().supabase, {
      account: ACCOUNT,
      eventId: "event-thu",
      now: NOW,
      usePass: "regular",
    });

    expect(outcome).toMatchObject({ error: "not_regular", ok: false });
  });

  it("refuses a game whose evening is over", async () => {
    const outcome = await switchSignupPass(supabaseSpy().supabase, {
      account: ACCOUNT,
      eventId: "event-thu",
      now: new Date("2026-11-07T12:00:00.000Z"),
      usePass: "regular",
    });

    expect(outcome).toMatchObject({ error: "closed", ok: false });
  });

  it("reports the pass taken by another sign-up in the same moment", async () => {
    mocks.claimEventSignup.mockResolvedValue("pass_held");

    const outcome = await switchSignupPass(supabaseSpy().supabase, {
      account: ACCOUNT,
      eventId: "event-thu",
      now: NOW,
      usePass: "regular",
    });

    expect(outcome).toMatchObject({ error: "pass_held", ok: false });
  });

  it("changes nothing when the ticket is already paid the way asked", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ usePass: "regular" })]);
    const { supabase, update } = supabaseSpy();

    const outcome = await switchSignupPass(supabase, {
      account: ACCOUNT,
      eventId: "event-thu",
      now: NOW,
      usePass: "regular",
    });

    expect(outcome.ok).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(mocks.claimEventSignup).not.toHaveBeenCalled();
  });
});
