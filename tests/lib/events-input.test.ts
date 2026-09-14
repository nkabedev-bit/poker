import { describe, expect, it } from "vitest";
import {
  eventInputSchema,
  EventInputError,
  readPublishAt,
  toEventDraft,
} from "@/lib/events/input";

function parse(overrides: Record<string, unknown> = {}) {
  return eventInputSchema.parse({
    startsAt: "2026-09-01T19:00",
    title: "ONE SHOT KNOCKOUT",
    ...overrides,
  });
}

describe("event input", () => {
  it("reads the form times as Moscow wall time and stores them as UTC", () => {
    const draft = toEventDraft(parse({ lateEntryUntil: "2026-09-01T22:10" }));

    expect(draft.startsAt).toBe("2026-09-01T16:00:00.000Z");
    expect(draft.lateEntryUntil).toBe("2026-09-01T19:10:00.000Z");
  });

  it("keeps optional counts empty instead of forcing zeros", () => {
    const draft = toEventDraft(parse());

    expect(draft.maxPlayers).toBeNull();
    expect(draft.maxVipPlayers).toBeNull();
    expect(draft.startingStack).toBeNull();
    expect(draft.badge).toBeNull();
    expect(draft.posterUrl).toBeNull();
    expect(draft.buyIn).toBe(0);
  });

  it("accepts the counts the admin did fill in", () => {
    const draft = toEventDraft(
      parse({ buyIn: "1250", maxPlayers: "20", maxVipPlayers: "10", startingStack: "120000" }),
    );

    expect(draft).toMatchObject({
      buyIn: 1250,
      maxPlayers: 20,
      maxVipPlayers: 10,
      startingStack: 120000,
    });
  });

  // Two tickets are sold: a regular seat and a VIP one.
  it("keeps the regular and the VIP ticket prices apart", () => {
    const draft = toEventDraft(parse({ buyIn: "1250", vipBuyIn: "2000" }));

    expect(draft).toMatchObject({ buyIn: 1250, vipBuyIn: 2000 });
  });

  it("leaves the VIP price empty when the tournament has no VIP ticket", () => {
    expect(toEventDraft(parse({ buyIn: "1250" })).vipBuyIn).toBeNull();
  });

  // A late entry before the start would let the app hide a game that has not begun.
  it("refuses a late entry that closes before the tournament starts", () => {
    expect(() => toEventDraft(parse({ lateEntryUntil: "2026-09-01T18:00" }))).toThrow(
      EventInputError,
    );
  });

  it("requires a title and a start time", () => {
    expect(eventInputSchema.safeParse({ startsAt: "2026-09-01T19:00" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ title: "Игра" }).success).toBe(false);
  });

  it("rejects a poster url that is not a url", () => {
    expect(eventInputSchema.safeParse({ posterUrl: "не ссылка", startsAt: "2026-09-01T19:00", title: "Игра" }).success).toBe(false);
  });
});

describe("publication time", () => {
  // Monday 14 September, 15:00 in Moscow.
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("reads the time a draft goes up as Moscow wall time", () => {
    const publishAt = readPublishAt(parse({ publishAt: "2026-09-15T10:00" }), now);

    expect(publishAt).toBe("2026-09-15T07:00:00.000Z");
  });

  it("leaves a draft without a time waiting for the admin", () => {
    expect(readPublishAt(parse(), now)).toBeNull();
  });

  // A poster already in front of the players has nothing left to wait for.
  it("drops the time once the poster is published", () => {
    const published = parse({ isPublished: true, publishAt: "2026-09-15T10:00" });

    expect(readPublishAt(published, now)).toBeNull();
  });

  // Taking a time gone by as "now" would put the poster up without anyone asking.
  it("refuses a time that has already gone", () => {
    expect(() => readPublishAt(parse({ publishAt: "2026-09-14T14:59" }), now)).toThrow(
      EventInputError,
    );
  });

  it("refuses a time it cannot read", () => {
    expect(() => readPublishAt(parse({ publishAt: "завтра утром" }), now)).toThrow(
      EventInputError,
    );
  });
});
