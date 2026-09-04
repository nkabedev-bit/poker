import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventRow } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  findDuoInvitation: vi.fn(),
  getEvent: vi.fn(),
  notifyClientUser: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/events/store", () => ({ getEvent: mocks.getEvent }));

vi.mock("@/lib/client-bot/notify", () => ({ notifyClientUser: mocks.notifyClientUser }));

vi.mock("@/lib/events/duo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/events/duo")>("@/lib/events/duo");
  return { ...actual, findDuoInvitation: mocks.findDuoInvitation };
});

vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => task(),
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const EVENT = mapEventRow({
  buy_in: 1250,
  duo_buy_in: 2000,
  id: "event-1",
  is_published: true,
  late_entry_until: "2999-01-01T19:00:00.000Z",
  max_duo_tickets: 1,
  max_players: 16,
  starts_at: "2999-01-01T16:00:00.000Z",
  title: "ЧЕТВЕРГОВЫЙ",
});

function supabaseSpy() {
  const upsert = vi.fn(async () => ({ error: null }));
  // `update(...).eq(...).eq(...)` is what the route awaits, so every link answers with
  // the same chain and the last one carries the result.
  const update = vi.fn(() => {
    const chain = { eq: vi.fn(() => ({ ...chain, error: null })) };
    return chain;
  });

  return { supabase: { from: vi.fn(() => ({ update, upsert })) }, update, upsert };
}

function authWith(supabase: unknown) {
  return {
    supabase,
    user: {
      display_name: "TitAn",
      profile_submitted_at: "2026-08-01T00:00:00.000Z",
      telegram_id: 777,
    },
  };
}

async function answer(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/client-tma/events/[id]/duo/route");
  return POST(
    new Request("http://localhost/api/client-tma/events/event-1/duo", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: "event-1" }) },
  );
}

describe("answering a 1+1 invitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.getEvent.mockResolvedValue(EVENT);
    mocks.notifyClientUser.mockResolvedValue(true);
    mocks.findDuoInvitation.mockResolvedValue({
      hostName: "Karel",
      hostTelegramId: 555,
      joined: false,
    });
  });

  it("writes the +1 their own half of the ticket", async () => {
    const { supabase, upsert } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith(supabase));

    const response = await answer({ accept: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ joined: true });
    expect(upsert).toHaveBeenCalledWith(
      {
        duo_host_telegram_id: 555,
        event_id: "event-1",
        status: "signed_up",
        telegram_id: 777,
        ticket_type: "duo_plus_one",
        use_pass: "none",
      },
      { onConflict: "event_id,telegram_id" },
    );
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      supabase,
      555,
      expect.stringContaining("TitAn"),
    );
  });

  // The buyer paid for a pair, so a refusal hands the ticket back with the seat free
  // for somebody else rather than cancelling what they bought.
  it("clears the partner and leaves the buyer their ticket on a refusal", async () => {
    const { supabase, update, upsert } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith(supabase));

    const response = await answer({ accept: false });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ joined: false });
    expect(upsert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      duo_confirmed_at: null,
      duo_partner_name: null,
      duo_partner_telegram_id: null,
    });
  });

  it("refuses an answer to an invitation that is gone", async () => {
    const { supabase, upsert } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith(supabase));
    mocks.findDuoInvitation.mockResolvedValue(null);

    const response = await answer({ accept: true });

    expect(response.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });
});
