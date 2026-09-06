import { describe, expect, it } from "vitest";
import { pickWaitlistToNotify, waitlistFreedMessage } from "@/lib/events/waitlist";
import type { EventSignup, EventTicketType } from "@/lib/events/types";

const waiting = (id: string, ticketType: EventTicketType): EventSignup => ({
  createdAt: "2026-09-06T10:00:00.000Z",
  duoConfirmedAt: null,
  duoHostUserId: null,
  duoInviteToken: null,
  duoPartnerName: null,
  duoPartnerUserId: null,
  eventId: "event-1",
  id,
  notifiedAt: null,
  status: "waitlist",
  telegramId: null,
  ticketType,
  usePass: "none",
  userId: `account-${id}`,
});

const seats = (over: Partial<{ duo: number; regular: number | null; vip: number | null }> = {}) => ({
  duo: 0,
  regular: 0,
  vip: 0,
  ...over,
});

describe("who hears that a place came free", () => {
  const queue = [waiting("a", "regular"), waiting("b", "vip"), waiting("c", "duo")];

  // The three allotments run out separately, and so does the news.
  it("tells only those waiting for the kind that opened", () => {
    expect(pickWaitlistToNotify(queue, seats({ regular: 1 })).map((e) => e.id)).toEqual(["a"]);
    expect(pickWaitlistToNotify(queue, seats({ vip: 1 })).map((e) => e.id)).toEqual(["b"]);
    expect(pickWaitlistToNotify(queue, seats({ duo: 1 })).map((e) => e.id)).toEqual(["c"]);
  });

  // Everybody at once, first to answer takes it — the club's own choice.
  it("tells everybody waiting for it, not just the first in line", () => {
    const crowd = [waiting("a", "regular"), waiting("b", "regular")];

    expect(pickWaitlistToNotify(crowd, seats({ regular: 1 }))).toHaveLength(2);
  });

  it("tells nobody while the room is still full", () => {
    expect(pickWaitlistToNotify(queue, seats())).toEqual([]);
  });

  // A poster with no limit on regular seats never runs out of them.
  it("counts an unlimited allotment as open", () => {
    expect(pickWaitlistToNotify(queue, seats({ regular: null })).map((e) => e.id)).toEqual(["a"]);
  });

  it("says which kind of place opened", () => {
    expect(waitlistFreedMessage("ЧЕТВЕРГОВЫЙ", "vip")).toContain("VIP-место");
    expect(waitlistFreedMessage("ЧЕТВЕРГОВЫЙ", "duo")).toContain("билет 1+1");
    expect(waitlistFreedMessage("ЧЕТВЕРГОВЫЙ", "regular")).toContain("ЧЕТВЕРГОВЫЙ");
  });
});
