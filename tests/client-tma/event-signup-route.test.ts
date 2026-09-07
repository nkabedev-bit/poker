import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventRow } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  countActiveSignups: vi.fn(),
  getEvent: vi.fn(),
  getUserSignups: vi.fn(),
  notifyClientUser: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/events/store", () => ({
  countActiveSignups: mocks.countActiveSignups,
  getEvent: mocks.getEvent,
  getUserSignups: mocks.getUserSignups,
}));

vi.mock("@/lib/client-bot/notify", () => ({
  notifyClientUser: mocks.notifyClientUser,
}));

vi.mock("next/server", () => ({
  // The bot is told after the sign-up stands; the tests want to see what it was told.
  after: (task: () => Promise<void>) => task(),
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const FUTURE_EVENT = mapEventRow({
  buy_in: 1500,
  id: "event-1",
  is_published: true,
  late_entry_until: "2999-01-01T19:00:00.000Z",
  max_players: 2,
  max_vip_players: 1,
  starts_at: "2999-01-01T16:00:00.000Z",
  title: "ONE SHOT KNOCKOUT",
  vip_buy_in: 2500,
});

const DUO_EVENT = mapEventRow({
  buy_in: 1250,
  duo_buy_in: 2000,
  id: "event-1",
  is_published: true,
  late_entry_until: "2999-01-01T19:00:00.000Z",
  max_duo_tickets: 1,
  max_players: 16,
  max_vip_players: 9,
  starts_at: "2999-01-01T16:00:00.000Z",
  title: "ЧЕТВЕРГОВЫЙ",
  vip_buy_in: 2000,
});

function taken({
  duo = 0,
  regular = 0,
  vip = 0,
}: { duo?: number; regular?: number; vip?: number } = {}) {
  return new Map([["event-1", { duo, regular, total: regular + vip + duo * 2, vip }]]);
}

/**
 * A stand-in for the tables this route writes to: sign-ups are upserted, and looking a
 * partner up by nickname reads the accounts.
 */
function upsertSpy({
  eventFull = false,
  members = [] as Array<{ display_name: string; id: string; telegram_id: number | null }>,
  partnerTaken = false,
} = {}) {
  const upsert = vi.fn<(row: unknown, options?: unknown) => Promise<{ error: null }>>(
    async () => ({ error: null }),
  );
  const update = vi.fn(() => {
    const chain = {
      eq: vi.fn(() => chain),
      neq: vi.fn(async () => ({ error: null })),
      then: undefined,
    };
    return chain;
  });

  const accounts = {
    eq: vi.fn(() => accounts),
    limit: vi.fn(async () => ({ data: members, error: null })),
    select: vi.fn(() => accounts),
  };

  // Reading the sign-ups back answers one question: is somebody else already bringing
  // this player. Writing them is the upsert above.
  const signups = {
    eq: vi.fn(() => signups),
    limit: vi.fn(async () => ({
      data: partnerTaken ? [{ telegram_id: 111 }] : [],
      error: null,
    })),
    neq: vi.fn(() => signups),
    select: vi.fn(() => signups),
    update,
    upsert,
  };

  // Stands in for claim_event_signup: the database counts the room under the poster's
  // row lock and writes the row itself, so the fake writes it too — the assertions below
  // describe what lands in the table either way.
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn !== "claim_event_signup") return { data: null, error: null };
    if (eventFull) return { data: null, error: { message: "Event is full" } };

    await upsert(
      {
        duo_confirmed_at: args.p_duo_confirmed_at,
        duo_invite_token: args.p_duo_invite_token,
        duo_partner_name: args.p_duo_partner_name,
        duo_partner_user_id: args.p_duo_partner_user_id,
        event_id: args.p_event_id,
        status: args.p_status,
        telegram_id: args.p_telegram_id,
        ticket_type: args.p_ticket_type,
        use_pass: args.p_use_pass,
        user_id: args.p_user_id,
      },
      { onConflict: "event_id,user_id" },
    );

    return { data: {}, error: null };
  });

  return {
    rpc,
    supabase: {
      from: vi.fn((table: string) => (table === "client_bot_users" ? accounts : signups)),
      rpc,
    },
    update,
    upsert,
  };
}

function authWith({
  freeEntries = 0,
  profileSubmitted = true,
  supabase = upsertSpy().supabase,
  vipFreeEntries = 0,
}: {
  freeEntries?: number;
  profileSubmitted?: boolean;
  supabase?: unknown;
  vipFreeEntries?: number;
} = {}) {
  return {
    supabase,
    user: {
      display_name: "Ace High",
      free_entries: freeEntries,
      id: "account-host",
      profile_submitted_at: profileSubmitted ? "2026-08-01T00:00:00.000Z" : null,
      telegram_id: 555,
      vip_free_entries: vipFreeEntries,
    },
  };
}

async function postSignup(body?: Record<string, unknown>) {
  const { POST } = await import("@/app/api/client-tma/events/[id]/signup/route");
  return POST(
    new Request("http://localhost/api/client-tma/events/event-1/signup", {
      body: body ? JSON.stringify(body) : undefined,
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: "event-1" }) },
  );
}

describe("client sign-up route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.getEvent.mockResolvedValue(FUTURE_EVENT);
    mocks.countActiveSignups.mockResolvedValue(taken());
    mocks.getUserSignups.mockResolvedValue([]);
    mocks.notifyClientUser.mockResolvedValue(true);
  });

  // The room is read and then written to a moment later. Two players tapping together
  // both used to read "one place left" and both took it, so the club sold one more seat
  // than it opened. The database counts again inside the write and refuses the loser.
  it("refuses the player who lost the race for the last place", async () => {
    const { supabase, upsert } = upsertSpy({ eventFull: true });
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup();
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("full");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("records a sign-up for a player who filled in the questionnaire", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup();

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      {
        duo_confirmed_at: null,
        duo_invite_token: null,
        duo_partner_name: null,
        duo_partner_user_id: null,
        event_id: "event-1",
        status: "signed_up",
        telegram_id: 555,
        ticket_type: "regular",
        use_pass: "none",
        user_id: "account-host",
      },
      { onConflict: "event_id,user_id" },
    );
  });

  it("remembers the free entry the player chose to pay with", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase, vipFreeEntries: 2 }));

    const response = await postSignup({ ticketType: "vip", usePass: "vip" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ usePass: "vip" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ use_pass: "vip" }),
      { onConflict: "event_id,user_id" },
    );
  });

  it("records the ticket the player asked for", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ ticketType: "vip" });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_type: "vip" }),
      { onConflict: "event_id,user_id" },
    );
  });

  it("refuses a VIP seat once the VIP table is spoken for", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.countActiveSignups.mockResolvedValue(taken({ vip: 1 }));

    const response = await postSignup({ ticketType: "vip" });

    expect(response.status).toBe(409);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps the regular seats open when only the VIP table is full", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.countActiveSignups.mockResolvedValue(taken({ vip: 1 }));

    const response = await postSignup({ ticketType: "regular" });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_type: "regular" }),
      { onConflict: "event_id,user_id" },
    );
  });

  // A pass buys the ticket of its own kind and nothing else.
  it("does not spend a regular pass on a VIP ticket", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ freeEntries: 3, supabase }));

    await postSignup({ ticketType: "vip", usePass: "regular" });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_type: "vip", use_pass: "none" }),
      { onConflict: "event_id,user_id" },
    );
  });

  it("ignores a pass the player does not hold", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ freeEntries: 3, supabase }));

    // A VIP pass is a different thing from a regular one, so holding three regular
    // entries does not let the player claim a VIP seat for free.
    const response = await postSignup({ usePass: "vip" });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ use_pass: "none" }),
      { onConflict: "event_id,user_id" },
    );
  });

  it("sends a player without a questionnaire to fill it in first", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ profileSubmitted: false, supabase }));

    const response = await postSignup();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("profile_required");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a sign-up once every seat is taken", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.countActiveSignups.mockResolvedValue(taken({ regular: 2 }));

    const response = await postSignup();

    expect(response.status).toBe(409);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a sign-up when late entry has already closed", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.getEvent.mockResolvedValue(
      mapEventRow({
        id: "event-1",
        is_published: true,
        late_entry_until: "2020-01-01T19:00:00.000Z",
        starts_at: "2020-01-01T16:00:00.000Z",
        title: "Прошедший турнир",
      }),
    );

    const response = await postSignup();

    expect(response.status).toBe(409);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("hides an unpublished event from players", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue(authWith());
    mocks.getEvent.mockResolvedValue({ ...FUTURE_EVENT, isPublished: false });

    const response = await postSignup();

    expect(response.status).toBe(404);
  });
});

describe("the 1+1 ticket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.getEvent.mockResolvedValue(DUO_EVENT);
    mocks.countActiveSignups.mockResolvedValue(taken());
    mocks.getUserSignups.mockResolvedValue([]);
    mocks.notifyClientUser.mockResolvedValue(true);
  });

  it("records who the buyer is bringing", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ partnerName: "  Дима   Б ", ticketType: "duo" });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ duo_partner_name: "Дима Б", ticket_type: "duo" }),
      { onConflict: "event_id,user_id" },
    );
  });

  // A member typed by hand instead of picked from the list used to become a guest: no
  // invitation reached them, nothing appeared in their app, and the club recorded the
  // evening against a name rather than their account.
  it("refuses a club member written in as a guest", async () => {
    const { supabase, upsert } = upsertSpy({
      members: [{ display_name: "Sokur", id: "account-sokur", telegram_id: 909 }],
    });
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ partnerName: "Sokur", ticketType: "duo" });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("partner_required");
    expect(payload.message).toContain("есть в клубе");
    expect(payload.message).toContain("Sokur");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("still takes a guest the club has never heard of", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ partnerName: "Дядя Вова", ticketType: "duo" });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ duo_partner_name: "Дядя Вова", duo_partner_user_id: null }),
      { onConflict: "event_id,user_id" },
    );
  });

  // The whole point of the ticket is that the club expects two people by name.
  it("refuses a pair without a second player", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ ticketType: "duo" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "partner_required" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses once the evening's pairs are sold, with regular seats still open", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.countActiveSignups.mockResolvedValue(taken({ duo: 1 }));

    const response = await postSignup({ partnerName: "Дима", ticketType: "duo" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "full" });
    expect(upsert).not.toHaveBeenCalled();
  });

  // A pass buys one ticket; the pair already has a price of its own for the two of them.
  it("never spends a free pass on a pair", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ freeEntries: 3, supabase }));

    const response = await postSignup({
      partnerName: "Дима",
      ticketType: "duo",
      usePass: "regular",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ usePass: "none" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_type: "duo", use_pass: "none" }),
      { onConflict: "event_id,user_id" },
    );
  });

  it("forgets the partner when the player switches back to a single ticket", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    await postSignup({ partnerName: "Дима", ticketType: "regular" });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ duo_partner_name: null, ticket_type: "regular" }),
      { onConflict: "event_id,user_id" },
    );
  });

  it("invites a member of the club by nickname and tells them in the bot", async () => {
    const { supabase, upsert } = upsertSpy({
      members: [{ display_name: "TitAn", id: "account-titan", telegram_id: 777 }],
    });
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ partnerKey: "titan", ticketType: "duo" });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        duo_partner_name: "TitAn",
        duo_partner_user_id: "account-titan",
        ticket_type: "duo",
      }),
      { onConflict: "event_id,user_id" },
    );
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      supabase,
      "account-titan",
      expect.stringContaining("Ace High"),
    );
  });

  // Two accounts under one nickname: guessing between them would invite the wrong player.
  it("refuses a nickname shared by several accounts", async () => {
    const { supabase, upsert } = upsertSpy({
      members: [
        { display_name: "TitAn", id: "account-titan", telegram_id: 777 },
        { display_name: "titan", id: "account-other", telegram_id: 888 },
      ],
    });
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ partnerKey: "titan", ticketType: "duo" });

    expect(response.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });

  it("lets nobody bring themselves", async () => {
    const { supabase, upsert } = upsertSpy({
      members: [{ display_name: "Ace High", id: "account-host", telegram_id: 555 }],
    });
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ partnerKey: "acehigh", ticketType: "duo" });

    expect(response.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  // The buyer keeps the only pair ticket of the evening while naming somebody else.
  it("lets the buyer swap the partner without losing their own ticket", async () => {
    const { supabase, update, upsert } = upsertSpy({
      members: [{ display_name: "Secret", id: "account-secret", telegram_id: 999 }],
    });
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.countActiveSignups.mockResolvedValue(taken({ duo: 1 }));
    mocks.getUserSignups.mockResolvedValue([
      {
        duoConfirmedAt: null,
        duoHostUserId: null,
        duoPartnerName: "TitAn",
        duoPartnerUserId: "account-titan",
        eventId: "event-1",
        ticketType: "duo",
        userId: "account-host",
      },
    ]);

    const response = await postSignup({ partnerKey: "secret", ticketType: "duo" });

    expect(response.status).toBe(200);
    // The player who was asked before is withdrawn, and told the pair is off.
    expect(update).toHaveBeenCalledWith({ status: "cancelled" });
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      supabase,
      "account-titan",
      expect.any(String),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ duo_partner_user_id: "account-secret" }),
      { onConflict: "event_id,user_id" },
    );
  });

  it("sells no pair when the poster prices none", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.getEvent.mockResolvedValue(FUTURE_EVENT);

    const response = await postSignup({ partnerName: "Дима", ticketType: "duo" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ticketType: "regular" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ duo_partner_name: null, ticket_type: "regular" }),
      { onConflict: "event_id,user_id" },
    );
  });
  // A member comes as the +1 of one ticket only: two buyers naming the same person
  // leaves one of them with a partner who cannot come.
  it("refuses a partner somebody else is already bringing", async () => {
    const { supabase, upsert } = upsertSpy({
      members: [{ display_name: "TitAn", id: "account-titan", telegram_id: 777 }],
      partnerTaken: true,
    });
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ partnerKey: "titan", ticketType: "duo" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "partner_taken" });
    expect(upsert).not.toHaveBeenCalled();
    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });

  // Naming the same partner again asks them nothing new: un-answering them would strand
  // the pair, because the half of the ticket they already hold hides the question.
  it("leaves the partner's answer standing when the buyer names them again", async () => {
    const { supabase, upsert } = upsertSpy({
      members: [{ display_name: "TitAn", id: "account-titan", telegram_id: 777 }],
    });
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.countActiveSignups.mockResolvedValue(taken({ duo: 1 }));
    mocks.getUserSignups.mockResolvedValue([
      {
        duoConfirmedAt: "2026-08-02T00:00:00.000Z",
        duoHostUserId: null,
        duoPartnerName: "TitAn",
        duoPartnerUserId: "account-titan",
        eventId: "event-1",
        ticketType: "duo",
        userId: "account-host",
      },
    ]);

    const response = await postSignup({ partnerKey: "titan", ticketType: "duo" });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        duo_confirmed_at: "2026-08-02T00:00:00.000Z",
        duo_partner_user_id: "account-titan",
      }),
      { onConflict: "event_id,user_id" },
    );
    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });

  // Until they answer, asking again is a nudge rather than a lie: the question is still
  // on their screen, so the invitation is sent a second time.
  it("asks a partner who has not answered yet again", async () => {
    const { supabase, upsert } = upsertSpy({
      members: [{ display_name: "TitAn", id: "account-titan", telegram_id: 777 }],
    });
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.countActiveSignups.mockResolvedValue(taken({ duo: 1 }));
    mocks.getUserSignups.mockResolvedValue([
      {
        duoConfirmedAt: null,
        duoHostUserId: null,
        duoPartnerName: "TitAn",
        duoPartnerUserId: "account-titan",
        eventId: "event-1",
        ticketType: "duo",
        userId: "account-host",
      },
    ]);

    const response = await postSignup({ partnerKey: "titan", ticketType: "duo" });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ duo_confirmed_at: null }),
      { onConflict: "event_id,user_id" },
    );
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      supabase,
      "account-titan",
      expect.any(String),
    );
  });
  // The friend worth bringing is often the one who has not joined the club yet.
  it("mints a link when the buyer is inviting somebody new", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ partnerMode: "invite", ticketType: "duo" });
    const saved = await response.json();

    expect(response.status).toBe(200);
    expect(saved.inviteToken).toEqual(expect.any(String));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        duo_invite_token: saved.inviteToken,
        duo_partner_name: null,
        duo_partner_user_id: null,
        ticket_type: "duo",
      }),
      { onConflict: "event_id,user_id" },
    );
  });

  // A link already sent out has to keep working: opening the ticket again must not
  // break the one the friend is holding.
  it("keeps the link it already gave out", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.countActiveSignups.mockResolvedValue(taken({ duo: 1 }));
    mocks.getUserSignups.mockResolvedValue([
      {
        duoConfirmedAt: null,
        duoHostUserId: null,
        duoInviteToken: "already-sent",
        duoPartnerName: null,
        duoPartnerUserId: null,
        eventId: "event-1",
        ticketType: "duo",
        userId: "account-host",
      },
    ]);

    await postSignup({ partnerMode: "invite", ticketType: "duo" });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ duo_invite_token: "already-sent" }),
      { onConflict: "event_id,user_id" },
    );
  });

  it("asks for nobody's name when a link is being sent", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup({ partnerMode: "invite", ticketType: "duo" });

    // The nickname route refuses an empty partner; the link route is the partner.
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
  });
});
