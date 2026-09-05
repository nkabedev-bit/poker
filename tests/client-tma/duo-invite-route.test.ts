import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventRow } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  findDuoInvitation: vi.fn(),
  getEvent: vi.fn(),
  getUserSignups: vi.fn(),
  notifyClientUser: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/events/store", () => ({
  getEvent: mocks.getEvent,
  getUserSignups: mocks.getUserSignups,
}));

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
  // `update(...).eq(...).eq(...)` — and `.neq(...)` when a pair is withdrawn — is what
  // the route awaits, so every link answers with the same chain and it carries the
  // result whichever link the route stops at.
  const update = vi.fn(() => {
    const chain: Record<string, unknown> = { error: null };
    chain.eq = vi.fn(() => chain);
    chain.neq = vi.fn(() => chain);
    return chain;
  });

  return { supabase: { from: vi.fn(() => ({ update, upsert })) }, update, upsert };
}

function authWith(supabase: unknown) {
  return {
    supabase,
    user: {
      display_name: "TitAn",
      id: "account-plus-one",
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
    mocks.getUserSignups.mockResolvedValue([]);
    mocks.notifyClientUser.mockResolvedValue(true);
    mocks.findDuoInvitation.mockResolvedValue({
      hostName: "Karel",
      hostTelegramId: 555,
      hostUserId: "account-host",
      joined: false,
    });
  });

  it("writes the +1 their own half of the ticket", async () => {
    const { supabase, upsert } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith(supabase));

    const response = await answer({ accept: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ joined: true, releasedTicket: null });
    expect(upsert).toHaveBeenCalledWith(
      {
        duo_confirmed_at: null,
        duo_host_user_id: "account-host",
        duo_partner_name: null,
        duo_partner_user_id: null,
        event_id: "event-1",
        status: "signed_up",
        telegram_id: 777,
        ticket_type: "duo_plus_one",
        use_pass: "none",
        user_id: "account-plus-one",
      },
      { onConflict: "event_id,user_id" },
    );
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      supabase,
      "account-host",
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
    expect(await response.json()).toEqual({ joined: false, releasedTicket: null });
    expect(upsert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      duo_confirmed_at: null,
      duo_partner_name: null,
      duo_partner_user_id: null,
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

  // One player, one seat: coming as somebody's +1 lets go of the ticket they bought,
  // and the seat it held goes back on sale.
  it("releases the ticket the +1 had bought for themselves", async () => {
    const { supabase, upsert } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith(supabase));
    mocks.getUserSignups.mockResolvedValue([
      {
        duoConfirmedAt: null,
        duoHostUserId: null,
        duoPartnerName: null,
        duoPartnerUserId: null,
        eventId: "event-1",
        ticketType: "vip",
        userId: "account-plus-one",
      },
    ]);

    const response = await answer({ accept: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ joined: true, releasedTicket: "vip" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_type: "duo_plus_one" }),
      { onConflict: "event_id,user_id" },
    );
  });

  // Nobody is paying for the pair this player had bought, so it falls with the ticket
  // rather than leaving their own partner holding a seat.
  it("takes the +1's own pair down with the ticket they give up", async () => {
    const { supabase, update } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith(supabase));
    mocks.getUserSignups.mockResolvedValue([
      {
        duoConfirmedAt: "2026-08-02T00:00:00.000Z",
        duoHostUserId: null,
        duoPartnerName: "Дима",
        duoPartnerUserId: "account-dima",
        eventId: "event-1",
        ticketType: "duo",
        userId: "account-plus-one",
      },
    ]);

    const response = await answer({ accept: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ joined: true, releasedTicket: "duo" });
    expect(update).toHaveBeenCalledWith({ status: "cancelled" });
    // Both the host who invited them and the partner they are letting go are told.
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      supabase,
      "account-host",
      expect.any(String),
    );
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      supabase,
      "account-dima",
      expect.any(String),
    );
  });

  it("leaves a refusal to release nothing", async () => {
    const { supabase, update } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith(supabase));
    mocks.getUserSignups.mockResolvedValue([
      {
        duoConfirmedAt: null,
        duoHostUserId: null,
        duoPartnerName: null,
        duoPartnerUserId: null,
        eventId: "event-1",
        ticketType: "regular",
        userId: "account-plus-one",
      },
    ]);

    const response = await answer({ accept: false });

    expect(await response.json()).toEqual({ joined: false, releasedTicket: null });
    expect(update).toHaveBeenCalledWith({
      duo_confirmed_at: null,
      duo_partner_name: null,
      duo_partner_user_id: null,
    });
  });
});
