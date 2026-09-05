import { describe, expect, it } from "vitest";
import { countUnreadAnnouncements, formatUnreadBadge } from "@/lib/client/announcements";

const feed = [
  { createdAt: "2026-09-05T12:00:00.000Z" },
  { createdAt: "2026-09-04T12:00:00.000Z" },
  { createdAt: "2026-09-03T12:00:00.000Z" },
];

describe("counting what the player has not read", () => {
  // A player who has never opened the feed is owed all of it.
  it("counts everything for somebody who never opened it", () => {
    expect(countUnreadAnnouncements(feed, null)).toBe(3);
  });

  it("counts only what came after their last visit", () => {
    expect(countUnreadAnnouncements(feed, "2026-09-04T00:00:00.000Z")).toBe(2);
  });

  it("counts nothing once they have seen the newest", () => {
    expect(countUnreadAnnouncements(feed, "2026-09-06T00:00:00.000Z")).toBe(0);
  });

  // An announcement written in the same second as the visit is already on their screen.
  it("does not count one timed exactly at the visit", () => {
    expect(countUnreadAnnouncements(feed, "2026-09-05T12:00:00.000Z")).toBe(0);
  });

  it("shows everything rather than nothing when the timestamp is unreadable", () => {
    expect(countUnreadAnnouncements(feed, "когда-то")).toBe(3);
  });

  it("counts nothing in an empty club", () => {
    expect(countUnreadAnnouncements([], null)).toBe(0);
  });
});

describe("the badge", () => {
  it("stays empty when there is nothing new", () => {
    expect(formatUnreadBadge(0)).toBe("");
    expect(formatUnreadBadge(-1)).toBe("");
  });

  it("counts up to nine and then stops", () => {
    expect(formatUnreadBadge(3)).toBe("3");
    expect(formatUnreadBadge(9)).toBe("9");
    expect(formatUnreadBadge(10)).toBe("9+");
  });
});
