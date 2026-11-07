import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ notifyClientUser: vi.fn() }));

vi.mock("@/lib/client-bot/notify", () => ({ notifyClientUser: mocks.notifyClientUser }));

import { announceWaitlistOffer } from "@/lib/events/waitlist-offers";

const PHOENIX = { id: "e731137e-5c31-49b1-bb57-2a4cafc84168", title: "Phoenix" };
const OFFER = {
  expiresAt: new Date("2026-11-07T12:30:00.000Z"),
  ticketType: "regular" as const,
  userId: "queue-1",
};

function fakeSupabase() {
  const writes: Array<{ filters: Array<[string, unknown]>; patch: Record<string, unknown> }> = [];
  const supabase = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const write = { filters: [] as Array<[string, unknown]>, patch };
        writes.push(write);
        const chain = {
          eq: (column: string, value: unknown) => {
            write.filters.push([column, value]);
            return chain;
          },
          then: (resolve: (result: { error: null }) => unknown) => resolve({ error: null }),
        };
        return chain;
      },
    }),
  } as never;

  return { supabase, writes };
}

beforeEach(() => vi.clearAllMocks());

describe("telling the queue about a held seat", () => {
  it("asks the moved game's question with its two buttons", async () => {
    mocks.notifyClientUser.mockResolvedValue(true);
    const { supabase, writes } = fakeSupabase();

    await announceWaitlistOffer(supabase, PHOENIX, OFFER);

    const [, userId, text, keyboard] = mocks.notifyClientUser.mock.calls[0];
    expect(userId).toBe("queue-1");
    expect(text).toContain("PHOENIX В ВОСКРЕСЕНЬЕ НАЧНЁТСЯ В 13:00");
    expect(text).toContain("держим его до 15:30");
    expect(keyboard.inline_keyboard[0].map((button: { text: string }) => button.text)).toEqual([
      "Да",
      "Нет",
    ]);
    expect(writes).toEqual([]);
  });

  it("ends the turn at once when the question cannot reach the player", async () => {
    mocks.notifyClientUser.mockResolvedValue(false);
    const { supabase, writes } = fakeSupabase();

    await announceWaitlistOffer(supabase, PHOENIX, OFFER);

    expect(writes).toHaveLength(1);
    expect(writes[0].filters).toEqual([
      ["event_id", PHOENIX.id],
      ["user_id", "queue-1"],
      ["status", "waitlist"],
    ]);
    expect(typeof writes[0].patch.waitlist_offer_expires_at).toBe("string");
  });

  it("keeps the usual message and the usual hold for any other game", async () => {
    mocks.notifyClientUser.mockResolvedValue(false);
    const { supabase, writes } = fakeSupabase();

    await announceWaitlistOffer(supabase, { id: "other", title: "Четверговый" }, OFFER);

    const [, , text, keyboard] = mocks.notifyClientUser.mock.calls[0];
    expect(text).toContain("очередь дошла до вас");
    expect(keyboard).toBeUndefined();
    expect(writes).toEqual([]);
  });
});
