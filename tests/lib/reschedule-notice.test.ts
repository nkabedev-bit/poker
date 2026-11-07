import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventRow, type EventSignup } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  announceWaitlistOffer: vi.fn(),
  claimEventSignup: vi.fn(),
  getEvent: vi.fn(),
  getUserSignups: vi.fn(),
  notifyClientUser: vi.fn(),
  offerFreedSeats: vi.fn(),
  readSignupBan: vi.fn(),
  readSignupDebt: vi.fn(),
}));

vi.mock("@/lib/events/store", () => ({
  getEvent: mocks.getEvent,
  getUserSignups: mocks.getUserSignups,
}));
vi.mock("@/lib/events/claim-signup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events/claim-signup")>()),
  claimEventSignup: mocks.claimEventSignup,
}));
vi.mock("@/lib/events/waitlist-offers", () => ({
  announceWaitlistOffer: mocks.announceWaitlistOffer,
  offerFreedSeats: mocks.offerFreedSeats,
}));
vi.mock("@/lib/client-bot/notify", () => ({ notifyClientUser: mocks.notifyClientUser }));
vi.mock("@/lib/client-bot/broadcast", () => ({ getClientBot: () => null, sendToChats: vi.fn() }));
vi.mock("@/lib/client-bot/signup-ban", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-bot/signup-ban")>()),
  readSignupBan: mocks.readSignupBan,
}));
vi.mock("@/lib/debts/store", () => ({ readSignupDebt: mocks.readSignupDebt }));

import {
  buildRescheduleKeyboard,
  findRescheduleNotice,
  parseRescheduleCallback,
  rescheduleAnswerText,
  rescheduleWaitlistText,
} from "@/lib/events/reschedule-notice";
import { answerRescheduleNotice } from "@/lib/events/reschedule-answers";

const PHOENIX_ID = "e731137e-5c31-49b1-bb57-2a4cafc84168";
const NOW = new Date("2026-11-07T11:00:00.000Z");

const PHOENIX = mapEventRow({
  id: PHOENIX_ID,
  is_published: true,
  late_entry_until: "2026-11-08T12:35:00.000Z",
  max_duo_tickets: 3,
  max_players: 24,
  starts_at: "2026-11-08T10:00:00.000Z",
  title: "Phoenix",
});

function signup(overrides: Partial<EventSignup> = {}): EventSignup {
  return {
    createdAt: "2026-11-02T16:00:00.000Z",
    duoConfirmedAt: null,
    duoHostUserId: null,
    duoInviteToken: null,
    duoPartnerName: null,
    duoPartnerUserId: null,
    eventId: PHOENIX_ID,
    id: "signup-1",
    notifiedAt: null,
    status: "signed_up",
    telegramId: 555,
    ticketType: "regular",
    userId: "user-1",
    usePass: "none",
    waitlistOfferExpiresAt: null,
    waitlistOfferedAt: null,
    ...overrides,
  } as EventSignup;
}

type Write = { filters: Array<[string, unknown]>; patch: Record<string, unknown> };

/**
 * Answers the account read and records every write to the sign-ups, in order. A write
 * that asks for its rows back (`select`) gets `returned`.
 */
function fakeSupabase({ returned = [] as Array<Record<string, unknown>> } = {}) {
  const writes: Write[] = [];

  const accounts = {
    eq: () => accounts,
    maybeSingle: async () => ({ data: { display_name: "Игрок", id: "user-1" }, error: null }),
    select: () => accounts,
  };

  function signupWrite(patch: Record<string, unknown>) {
    const write: Write = { filters: [], patch };
    writes.push(write);
    let wantsRows = false;

    const chain = {
      eq: (column: string, value: unknown) => {
        write.filters.push([column, value]);
        return chain;
      },
      neq: (column: string, value: unknown) => {
        write.filters.push([`not ${column}`, value]);
        return chain;
      },
      select: () => {
        wantsRows = true;
        return chain;
      },
      then: (resolve: (result: { data: unknown; error: null }) => unknown) =>
        resolve({ data: wantsRows ? returned : null, error: null }),
    };
    return chain;
  }

  const supabase = {
    from: (table: string) =>
      table === "client_bot_users" ? accounts : { update: signupWrite },
  } as never;

  return { supabase, writes };
}

function answer(accept: boolean) {
  return { answer: { accept, eventId: PHOENIX_ID }, telegramId: 555 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEvent.mockResolvedValue(PHOENIX);
  mocks.offerFreedSeats.mockResolvedValue([]);
  mocks.readSignupBan.mockResolvedValue(null);
  mocks.readSignupDebt.mockResolvedValue(null);
  mocks.claimEventSignup.mockResolvedValue(null);
});

describe("the reschedule buttons", () => {
  it("carries the game in both answers and reads them back", () => {
    const [yes, no] = buildRescheduleKeyboard(PHOENIX_ID).inline_keyboard[0] as Array<{
      callback_data: string;
      text: string;
    }>;

    expect([yes.text, no.text]).toEqual(["Да", "Нет"]);
    expect(parseRescheduleCallback(yes.callback_data)).toEqual({ accept: true, eventId: PHOENIX_ID });
    expect(parseRescheduleCallback(no.callback_data)).toEqual({ accept: false, eventId: PHOENIX_ID });
    // Telegram refuses callback data over 64 bytes.
    expect(new TextEncoder().encode(yes.callback_data).length).toBeLessThanOrEqual(64);
  });

  it("leaves every other button to its own handler", () => {
    expect(parseRescheduleCallback("pass_offer:yes:abc")).toBeNull();
    expect(parseRescheduleCallback(undefined)).toBeNull();
  });

  it("keeps the club's wording and adds what came of the tap", () => {
    const notice = findRescheduleNotice(PHOENIX_ID)!;

    expect(notice.text).toContain("8 ноября стартуем в 13:00 вместо 17:00");
    expect(rescheduleAnswerText(notice, { kind: "released" })).toBe(
      `${notice.text}\n\nВы ответили «Нет» — бронь снята. Спасибо, что предупредили!`,
    );
    expect(rescheduleWaitlistText(notice, new Date("2026-11-07T12:30:00.000Z"))).toContain(
      "держим его до 15:30",
    );
  });

  it("knows no notice for any other game", () => {
    expect(findRescheduleNotice("other-event")).toBeNull();
  });
});

describe("a seat holder's answer", () => {
  it("changes nothing on yes", async () => {
    mocks.getUserSignups.mockResolvedValue([signup()]);
    const { supabase, writes } = fakeSupabase();

    await expect(answerRescheduleNotice(supabase, answer(true), NOW)).resolves.toEqual({
      kind: "confirmed",
    });
    expect(writes).toEqual([]);
    expect(mocks.offerFreedSeats).not.toHaveBeenCalled();
  });

  it("gives the seat back on no and offers it to the queue with the same question", async () => {
    mocks.getUserSignups.mockResolvedValue([signup()]);
    const offer = { expiresAt: new Date(), ticketType: "regular", userId: "queue-1" };
    mocks.offerFreedSeats.mockResolvedValue([offer]);
    const { supabase, writes } = fakeSupabase();

    await expect(answerRescheduleNotice(supabase, answer(false), NOW)).resolves.toEqual({
      kind: "released",
    });
    expect(writes).toEqual([
      { filters: [["event_id", PHOENIX_ID], ["user_id", "user-1"]], patch: { status: "cancelled" } },
    ]);
    expect(mocks.announceWaitlistOffer).toHaveBeenCalledWith(supabase, PHOENIX, offer);
  });

  it("hands a pair to the +1 when the buyer says no, freeing nothing", async () => {
    mocks.getUserSignups.mockResolvedValue([
      signup({ duoPartnerUserId: "partner-1", ticketType: "duo" }),
    ]);
    const { supabase, writes } = fakeSupabase({ returned: [{ user_id: "partner-1" }] });

    await expect(answerRescheduleNotice(supabase, answer(false), NOW)).resolves.toEqual({
      kind: "pair_handed_over",
    });
    // The +1 becomes the ticket before the buyer lets go of it.
    expect(writes.map((write) => write.patch)).toEqual([
      { duo_host_user_id: null, ticket_type: "duo" },
      { status: "cancelled" },
    ]);
    expect(writes[0].filters).toContainEqual(["duo_host_user_id", "user-1"]);
    expect(writes[0].filters).toContainEqual(["status", "signed_up"]);
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      supabase,
      "partner-1",
      expect.stringContaining("билет теперь ваш"),
    );
    expect(mocks.offerFreedSeats).not.toHaveBeenCalled();
  });

  it("frees the pair when the buyer says no with nobody left on it", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ ticketType: "duo" })]);
    const { supabase, writes } = fakeSupabase({ returned: [] });

    await expect(answerRescheduleNotice(supabase, answer(false), NOW)).resolves.toEqual({
      kind: "released",
    });
    expect(writes[1].patch).toEqual({ status: "cancelled" });
    expect(mocks.offerFreedSeats).toHaveBeenCalledOnce();
  });

  it("lets the +1 go and leaves the buyer the ticket to bring somebody else", async () => {
    mocks.getUserSignups.mockResolvedValue([
      signup({ duoHostUserId: "host-1", ticketType: "duo_plus_one" }),
    ]);
    const { supabase, writes } = fakeSupabase();

    await expect(answerRescheduleNotice(supabase, answer(false), NOW)).resolves.toEqual({
      kind: "released",
    });
    expect(writes).toEqual([
      { filters: [["event_id", PHOENIX_ID], ["user_id", "user-1"]], patch: { status: "cancelled" } },
      {
        filters: [["event_id", PHOENIX_ID], ["user_id", "host-1"]],
        patch: { duo_confirmed_at: null, duo_partner_name: null, duo_partner_user_id: null },
      },
    ]);
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      supabase,
      "host-1",
      expect.stringContaining("Билет 1+1 остался за вами"),
    );
  });
});

describe("an answer from the queue", () => {
  it("takes the held seat on yes", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ status: "waitlist" })]);
    const { supabase } = fakeSupabase();

    await expect(answerRescheduleNotice(supabase, answer(true), NOW)).resolves.toEqual({
      kind: "seated_from_queue",
    });
    expect(mocks.claimEventSignup).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ eventId: PHOENIX_ID, status: "signed_up", userId: "user-1" }),
    );
  });

  it("says the seat went on when the room is full by the time of the tap", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ status: "waitlist" })]);
    mocks.claimEventSignup.mockResolvedValue("full");
    const { supabase } = fakeSupabase();

    await expect(answerRescheduleNotice(supabase, answer(true), NOW)).resolves.toEqual({
      kind: "seat_gone",
    });
  });

  it("keeps a banned player out, as the app does", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ status: "waitlist" })]);
    mocks.readSignupBan.mockResolvedValue("2026-11-10T00:00:00.000Z");
    const { supabase } = fakeSupabase();

    const outcome = await answerRescheduleNotice(supabase, answer(true), NOW);

    expect(outcome?.kind).toBe("blocked");
    expect(mocks.claimEventSignup).not.toHaveBeenCalled();
  });

  it("leaves the queue on no and passes the seat to the next in line", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ status: "waitlist" })]);
    const { supabase, writes } = fakeSupabase();

    await expect(answerRescheduleNotice(supabase, answer(false), NOW)).resolves.toEqual({
      kind: "left_queue",
    });
    expect(writes[0]).toEqual({
      filters: [["event_id", PHOENIX_ID], ["user_id", "user-1"], ["status", "waitlist"]],
      patch: { status: "cancelled", waitlist_offer_expires_at: null },
    });
    expect(mocks.offerFreedSeats).toHaveBeenCalledOnce();
  });
});

describe("an answer that has nothing to act on", () => {
  it("is told the sign-up is gone after it was already given back", async () => {
    mocks.getUserSignups.mockResolvedValue([signup({ status: "cancelled" })]);
    const { supabase, writes } = fakeSupabase();

    await expect(answerRescheduleNotice(supabase, answer(false), NOW)).resolves.toEqual({
      kind: "no_signup",
    });
    expect(writes).toEqual([]);
  });

  it("changes nothing once sign-ups have closed", async () => {
    mocks.getUserSignups.mockResolvedValue([signup()]);
    const { supabase, writes } = fakeSupabase();

    await expect(
      answerRescheduleNotice(supabase, answer(false), new Date("2026-11-08T13:00:00.000Z")),
    ).resolves.toEqual({ kind: "closed" });
    expect(writes).toEqual([]);
  });
});
