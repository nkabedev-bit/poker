import { describe, expect, it } from "vitest";
import {
  pickWaitlistOffers,
  waitlistOfferDeadline,
  waitlistOfferMessage,
  waitlistOfferMissedMessage,
  WAITLIST_OFFER_MINUTES,
} from "@/lib/events/waitlist";
import { takesSeat } from "@/lib/events/types";
import type { EventSignup, EventTicketType } from "@/lib/events/types";

const NOW = new Date("2026-09-09T12:00:00.000Z");

const waiting = (
  id: string,
  ticketType: EventTicketType,
  over: Partial<EventSignup> = {},
): EventSignup => ({
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
  waitlistOfferExpiresAt: null,
  waitlistOfferedAt: null,
  ...over,
});

const seats = (over: Partial<{ duo: number; regular: number | null; vip: number | null }> = {}) => ({
  duo: 0,
  regular: 0,
  vip: 0,
  ...over,
});

describe("who the freed place goes to", () => {
  const queue = [waiting("a", "regular"), waiting("b", "vip"), waiting("c", "duo")];

  // The three allotments run out separately, and so does the news.
  it("offers only to those waiting for the kind that opened", () => {
    expect(pickWaitlistOffers(queue, seats({ regular: 1 }), NOW).map((e) => e.id)).toEqual(["a"]);
    expect(pickWaitlistOffers(queue, seats({ vip: 1 }), NOW).map((e) => e.id)).toEqual(["b"]);
    expect(pickWaitlistOffers(queue, seats({ duo: 1 }), NOW).map((e) => e.id)).toEqual(["c"]);
  });

  // The whole point of the fix: the evening is not won by whoever taps fastest.
  it("offers one freed place to the first in line and to nobody else", () => {
    const crowd = [
      waiting("second", "regular", { createdAt: "2026-09-06T11:00:00.000Z" }),
      waiting("first", "regular", { createdAt: "2026-09-06T09:00:00.000Z" }),
      waiting("third", "regular", { createdAt: "2026-09-06T12:00:00.000Z" }),
    ];

    expect(pickWaitlistOffers(crowd, seats({ regular: 1 }), NOW).map((e) => e.id)).toEqual([
      "first",
    ]);
  });

  it("reaches as far down the queue as there are places", () => {
    const crowd = [
      waiting("first", "regular", { createdAt: "2026-09-06T09:00:00.000Z" }),
      waiting("second", "regular", { createdAt: "2026-09-06T10:00:00.000Z" }),
      waiting("third", "regular", { createdAt: "2026-09-06T11:00:00.000Z" }),
    ];

    expect(pickWaitlistOffers(crowd, seats({ regular: 2 }), NOW).map((e) => e.id)).toEqual([
      "first",
      "second",
    ]);
  });

  // Their place is already counted as taken; saying it twice says nothing new.
  it("passes over a player who is holding a place already", () => {
    const crowd = [
      waiting("first", "regular", {
        createdAt: "2026-09-06T09:00:00.000Z",
        waitlistOfferedAt: "2026-09-09T11:50:00.000Z",
        waitlistOfferExpiresAt: "2026-09-09T12:20:00.000Z",
      }),
      waiting("second", "regular", { createdAt: "2026-09-06T10:00:00.000Z" }),
    ];

    expect(pickWaitlistOffers(crowd, seats({ regular: 1 }), NOW).map((e) => e.id)).toEqual([
      "second",
    ]);
  });

  // One turn each: a silent player would otherwise be woken every half hour.
  it("does not come back to somebody whose turn already passed", () => {
    const crowd = [
      waiting("silent", "regular", {
        createdAt: "2026-09-06T09:00:00.000Z",
        waitlistOfferedAt: "2026-09-09T10:00:00.000Z",
        waitlistOfferExpiresAt: null,
      }),
      waiting("next", "regular", { createdAt: "2026-09-06T10:00:00.000Z" }),
    ];

    expect(pickWaitlistOffers(crowd, seats({ regular: 1 }), NOW).map((e) => e.id)).toEqual(["next"]);
    // And with the line run out, the seat is simply open to everybody.
    expect(pickWaitlistOffers([crowd[0]], seats({ regular: 1 }), NOW)).toEqual([]);
  });

  it("offers nothing while the room is still full", () => {
    expect(pickWaitlistOffers(queue, seats(), NOW)).toEqual([]);
  });

  // A poster with no limit on regular seats never runs out of them.
  it("counts an unlimited allotment as open", () => {
    expect(pickWaitlistOffers(queue, seats({ regular: null }), NOW).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("how long a freed place is held", () => {
  const event = { lateEntryUntil: null, startsAt: "2026-09-09T18:00:00.000Z" };

  it("holds it for half an hour", () => {
    const deadline = waitlistOfferDeadline(event, NOW);

    expect(deadline?.toISOString()).toBe("2026-09-09T12:30:00.000Z");
    expect(WAITLIST_OFFER_MINUTES).toBe(30);
  });

  // A seat held past the hour sign-ups close is a seat nobody can take.
  it("cuts the hold short at the moment sign-ups close", () => {
    const closing = { lateEntryUntil: "2026-09-09T12:10:00.000Z", startsAt: "2026-09-09T18:00:00.000Z" };

    expect(waitlistOfferDeadline(closing, NOW)?.toISOString()).toBe("2026-09-09T12:10:00.000Z");
  });

  it("holds nothing once sign-ups are closed", () => {
    expect(waitlistOfferDeadline({ lateEntryUntil: null, startsAt: "2026-09-09T11:00:00.000Z" }, NOW))
      .toBeNull();
  });
});

describe("what the room counts as taken", () => {
  it("counts a held place, and stops counting it when the hold runs out", () => {
    expect(takesSeat("waitlist", "2026-09-09T12:20:00.000Z", NOW)).toBe(true);
    expect(takesSeat("waitlist", "2026-09-09T11:40:00.000Z", NOW)).toBe(false);
    expect(takesSeat("waitlist", null, NOW)).toBe(false);
  });

  it("counts the tickets that stand and nothing else", () => {
    expect(takesSeat("signed_up", null, NOW)).toBe(true);
    expect(takesSeat("seated", null, NOW)).toBe(true);
    expect(takesSeat("reserved", null, NOW)).toBe(true);
    expect(takesSeat("cancelled", null, NOW)).toBe(false);
    expect(takesSeat("no_show", null, NOW)).toBe(false);
  });
});

describe("what the player is told", () => {
  it("says which kind of place opened and until when it is held", () => {
    const until = new Date("2026-09-09T12:30:00.000Z");

    expect(waitlistOfferMessage("ЧЕТВЕРГОВЫЙ", "vip", until)).toContain("VIP-место");
    expect(waitlistOfferMessage("ЧЕТВЕРГОВЫЙ", "duo", until)).toContain("билет 1+1");
    expect(waitlistOfferMessage("ЧЕТВЕРГОВЫЙ", "regular", until)).toContain("ЧЕТВЕРГОВЫЙ");
    // Moscow wall time, which is what the posters quote.
    expect(waitlistOfferMessage("ЧЕТВЕРГОВЫЙ", "regular", until)).toContain("15:30");
  });

  it("says the queue moved on when the half hour passed", () => {
    expect(waitlistOfferMissedMessage("ЧЕТВЕРГОВЫЙ")).toContain("ЧЕТВЕРГОВЫЙ");
  });
});
