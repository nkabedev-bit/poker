import { describe, expect, it } from "vitest";
import {
  selectBroadcastsToForget,
  selectVisibleBroadcasts,
} from "@/lib/client-bot/broadcast-history";

function row(id: string, status: string, day: number) {
  return { id, send_at: `2026-09-${String(day).padStart(2, "0")}T18:00:00.000Z`, status };
}

const HISTORY = [
  row("old-sent", "sent", 1),
  row("older-sent", "sent", 2),
  row("newest-sent", "sent", 5),
  row("canceled", "canceled", 4),
  row("waiting", "pending", 9),
  row("failed", "failed", 3),
];

describe("selectVisibleBroadcasts", () => {
  it("shows what is still queued and the last two that went out", () => {
    expect(selectVisibleBroadcasts(HISTORY).map((item) => item.id)).toEqual([
      "waiting",
      "newest-sent",
      "canceled",
    ]);
  });

  it("keeps every queued broadcast, however many there are", () => {
    const queued = [row("a", "pending", 7), row("b", "pending", 8), row("c", "sending", 9)];

    expect(selectVisibleBroadcasts(queued)).toHaveLength(3);
  });

  it("shows a short history whole", () => {
    expect(selectVisibleBroadcasts([row("one", "sent", 1)]).map((item) => item.id)).toEqual([
      "one",
    ]);
  });
});

describe("selectBroadcastsToForget", () => {
  it("forgets the finished ones past the two most recent", () => {
    expect(selectBroadcastsToForget(HISTORY).sort()).toEqual([
      "failed",
      "old-sent",
      "older-sent",
    ]);
  });

  it("never forgets a broadcast that has not gone out", () => {
    const queued = [row("a", "pending", 1), row("b", "sending", 2), row("c", "pending", 3)];

    expect(selectBroadcastsToForget(queued)).toEqual([]);
  });

  it("forgets nothing when the history is already short", () => {
    expect(selectBroadcastsToForget([row("one", "sent", 1), row("two", "sent", 2)])).toEqual([]);
  });
});
