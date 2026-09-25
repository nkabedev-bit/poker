import type { SupabaseClient } from "@supabase/supabase-js";
import { GrammyError } from "grammy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBroadcastChats, sendToChats } from "@/lib/client-bot/broadcast";

/** The accounts table with `count` chats, handing out the page it is asked for. */
function subscribers(count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({ chat_id: 1000 + index }));
  const query = {
    not: () => query,
    order: () => query,
    range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
    select: () => query,
  };

  return { from: () => query } as unknown as SupabaseClient;
}

function tooManyRequests(retryAfter: number) {
  return new GrammyError(
    "Too Many Requests",
    {
      description: "Too Many Requests: retry after " + retryAfter,
      error_code: 429,
      ok: false,
      parameters: { retry_after: retryAfter },
    },
    "sendMessage",
    {},
  );
}

describe("readBroadcastChats", () => {
  // Past a thousand subscribers, one request quietly left the newest out.
  it("reaches every subscriber, past a thousand", async () => {
    const chats = await readBroadcastChats(subscribers(2345));

    expect(chats).toHaveLength(2345);
    expect(chats.at(-1)).toBe(1000 + 2344);
  });
});

describe("sendToChats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes to every chat, twenty-five a second rather than one at a time", async () => {
    const chats = Array.from({ length: 60 }, (_, index) => index + 1);
    const send = vi.fn(async (chatId: number) => chatId);

    const delivery = sendToChats(chats, send);
    // The first batch goes out at once; the next waits for the second to turn.
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(25);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(50);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await delivery).toEqual({ failed: 0, sent: 60 });
    expect(new Set(send.mock.calls.map(([chatId]) => chatId)).size).toBe(60);
  });

  it("waits as long as Telegram asks and tries once more", async () => {
    const send = vi.fn().mockRejectedValueOnce(tooManyRequests(3)).mockResolvedValue(undefined);

    const delivery = sendToChats([1], send);
    await vi.advanceTimersByTimeAsync(3000);

    expect(await delivery).toEqual({ failed: 0, sent: 1 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  // A player who blocked the bot is a failure to count, not a reason to stop.
  it("counts a chat that will not take the message and goes on", async () => {
    const send = vi.fn(async (chatId: number) => {
      if (chatId === 2) throw new Error("Forbidden: bot was blocked by the user");
    });

    expect(await sendToChats([1, 2, 3], send)).toEqual({ failed: 1, sent: 2 });
  });
});
