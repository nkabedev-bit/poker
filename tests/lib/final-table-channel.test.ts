import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = {
  deleteMessage: vi.fn(),
  sendMessage: vi.fn(),
  sendPoll: vi.fn(),
};

vi.mock("@/lib/client-bot/broadcast", () => ({
  getClientBot: () => ({ api }),
}));

const {
  announceFinalTableKnockout,
  FINAL_TABLE_CHANNEL,
  FINAL_TABLE_POLL_QUESTION,
  planFinalTablePosts,
  readChannelMessageIds,
  sendFinalTablePosts,
  withdrawFinalTablePosts,
} = await import("@/lib/knockouts/channel");

const FOUR_LEFT = ["Smartrichstyle", "mrk", "Sokur", "Fishkaa"];

function knockout(overrides: Partial<Parameters<typeof planFinalTablePosts>[0]> = {}) {
  return {
    finalTableSize: 10,
    place: 7,
    playerName: "javmaz",
    remaining: ["a", "b", "c", "d", "e", "f"],
    ...overrides,
  };
}

/** The bounty_log table, keeping what the code wrote to it. */
function bountyLog(error: unknown = null) {
  const updates: Array<{ id: unknown; values: unknown }> = [];
  const supabase = {
    from: () => ({
      update: (values: unknown) => ({
        eq: async (_column: string, id: unknown) => {
          updates.push({ id, values });
          return { error };
        },
      }),
    }),
  } as unknown as SupabaseClient;

  return { supabase, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  let nextId = 100;
  api.sendMessage.mockImplementation(async () => ({ message_id: nextId++ }));
  api.sendPoll.mockImplementation(async () => ({ message_id: nextId++ }));
  api.deleteMessage.mockResolvedValue(true);
});

describe("planFinalTablePosts", () => {
  it("posts a knockout at the final table the way the club writes it", () => {
    expect(planFinalTablePosts(knockout())).toEqual([
      { kind: "message", text: "javmaz вылетел — 7 место" },
    ]);
  });

  // 10 max: the final table starts at 10th place, and 11th is still somewhere else.
  it("starts at the final table and not a place earlier", () => {
    expect(planFinalTablePosts(knockout({ place: 10 }))).toHaveLength(1);
    expect(planFinalTablePosts(knockout({ place: 11 }))).toEqual([]);
  });

  it("follows the table size the tournament is dealt in", () => {
    expect(planFinalTablePosts(knockout({ finalTableSize: 9, place: 10 }))).toEqual([]);
    expect(planFinalTablePosts(knockout({ finalTableSize: 9, place: 9 }))).toHaveLength(1);
  });

  it("asks who will win once four are left", () => {
    expect(
      planFinalTablePosts(knockout({ place: 5, playerName: "Mers cls 055", remaining: FOUR_LEFT })),
    ).toEqual([
      { kind: "message", text: "Mers cls 055 вылетел — 5 место" },
      { kind: "poll", options: FOUR_LEFT, question: FINAL_TABLE_POLL_QUESTION },
    ]);
  });

  // After the poll the final table plays out without the channel.
  it("posts nothing from 4th place down", () => {
    for (const place of [4, 3, 2]) {
      expect(planFinalTablePosts(knockout({ place, remaining: FOUR_LEFT.slice(0, place - 1) }))).toEqual([]);
    }
  });

  it("never posts a re-entry", () => {
    expect(planFinalTablePosts(knockout({ place: null }))).toEqual([]);
  });

  it("keeps the knockout when the poll cannot be asked", () => {
    expect(planFinalTablePosts(knockout({ place: 5, remaining: ["Sokur"] }))).toEqual([
      { kind: "message", text: "javmaz вылетел — 5 место" },
    ]);
  });

  it("trims a name to what Telegram takes as a poll answer", () => {
    const longName = "x".repeat(150);
    const [, poll] = planFinalTablePosts(knockout({ place: 5, remaining: [longName, " mrk "] }));

    expect(poll).toEqual({
      kind: "poll",
      options: ["x".repeat(100), "mrk"],
      question: FINAL_TABLE_POLL_QUESTION,
    });
  });
});

describe("sendFinalTablePosts", () => {
  it("posts to the club's channel, the poll anonymous", async () => {
    const ids = await sendFinalTablePosts(
      api as never,
      planFinalTablePosts(knockout({ place: 5, remaining: FOUR_LEFT })),
    );

    expect(ids).toEqual([100, 101]);
    expect(api.sendMessage).toHaveBeenCalledWith(FINAL_TABLE_CHANNEL, "javmaz вылетел — 5 место");
    expect(api.sendPoll).toHaveBeenCalledWith(
      FINAL_TABLE_CHANNEL,
      FINAL_TABLE_POLL_QUESTION,
      FOUR_LEFT,
      { is_anonymous: true },
    );
  });

  // A poll under a knockout nobody saw makes no sense.
  it("stops at the first post Telegram turns away", async () => {
    api.sendMessage.mockRejectedValueOnce(new Error("Forbidden: bot is not a member of the channel chat"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});

    const ids = await sendFinalTablePosts(
      api as never,
      planFinalTablePosts(knockout({ place: 5, remaining: FOUR_LEFT })),
    );

    expect(ids).toEqual([]);
    expect(api.sendPoll).not.toHaveBeenCalled();
  });
});

describe("announceFinalTableKnockout", () => {
  it("remembers what it posted with the knockout", async () => {
    const { supabase, updates } = bountyLog();

    await announceFinalTableKnockout(supabase, {
      ...knockout({ place: 5, remaining: FOUR_LEFT }),
      bountyLogId: "log-1",
    });

    expect(updates).toEqual([{ id: "log-1", values: { channel_message_ids: [100, 101] } }]);
  });

  it("leaves the log alone when nothing is posted", async () => {
    const { supabase, updates } = bountyLog();

    await announceFinalTableKnockout(supabase, { ...knockout({ place: 12 }), bountyLogId: "log-1" });

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  // Two players out in one hand are recorded seconds apart; the channel must read 6th
  // before 5th and the poll.
  it("posts knockouts in the order they were recorded", async () => {
    const order: string[] = [];
    api.sendMessage.mockImplementation(async (_chat: string, text: string) => {
      // The first send answers slower than the second would.
      await new Promise((resolve) => setTimeout(resolve, text.includes("6 место") ? 20 : 0));
      order.push(text);
      return { message_id: order.length };
    });
    api.sendPoll.mockImplementation(async () => {
      order.push("poll");
      return { message_id: 99 };
    });
    const { supabase } = bountyLog();

    await Promise.all([
      announceFinalTableKnockout(supabase, { ...knockout({ place: 6, playerName: "Seller" }), bountyLogId: "a" }),
      announceFinalTableKnockout(supabase, {
        ...knockout({ place: 5, playerName: "Mers", remaining: FOUR_LEFT }),
        bountyLogId: "b",
      }),
    ]);

    expect(order).toEqual(["Seller вылетел — 6 место", "Mers вылетел — 5 место", "poll"]);
  });

  it("does not throw when the log cannot take the ids", async () => {
    const { supabase } = bountyLog({ message: 'column "channel_message_ids" does not exist' });
    vi.spyOn(console, "error").mockImplementationOnce(() => {});

    await expect(
      announceFinalTableKnockout(supabase, { ...knockout(), bountyLogId: "log-1" }),
    ).resolves.toBeUndefined();
  });
});

describe("withdrawFinalTablePosts", () => {
  it("deletes every post a cancelled knockout left in the channel", async () => {
    await withdrawFinalTablePosts([100, "101"]);

    expect(api.deleteMessage).toHaveBeenNthCalledWith(1, FINAL_TABLE_CHANNEL, 100);
    expect(api.deleteMessage).toHaveBeenNthCalledWith(2, FINAL_TABLE_CHANNEL, 101);
  });

  // Every knockout before the final table, and every one logged before the migration.
  it("does nothing for a knockout that was never posted", async () => {
    await withdrawFinalTablePosts(null);
    await withdrawFinalTablePosts(undefined);

    expect(api.deleteMessage).not.toHaveBeenCalled();
  });

  it("keeps deleting past a post that is already gone", async () => {
    api.deleteMessage.mockRejectedValueOnce(new Error("Bad Request: message to delete not found"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});

    await withdrawFinalTablePosts([100, 101]);

    expect(api.deleteMessage).toHaveBeenCalledTimes(2);
  });
});

describe("readChannelMessageIds", () => {
  it("keeps only real message ids", () => {
    expect(readChannelMessageIds([1, "2", 0, -3, 4.5, "x", null])).toEqual([1, 2]);
    expect(readChannelMessageIds("1,2")).toEqual([]);
  });
});
