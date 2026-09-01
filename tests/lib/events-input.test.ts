import { describe, expect, it } from "vitest";
import { eventInputSchema, EventInputError, toEventDraft } from "@/lib/events/input";

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
    expect(draft.startingStack).toBeNull();
    expect(draft.badge).toBeNull();
    expect(draft.posterUrl).toBeNull();
    expect(draft.buyIn).toBe(0);
  });

  it("accepts the counts the admin did fill in", () => {
    const draft = toEventDraft(parse({ buyIn: "1500", maxPlayers: "90", startingStack: "120000" }));

    expect(draft).toMatchObject({ buyIn: 1500, maxPlayers: 90, startingStack: 120000 });
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
