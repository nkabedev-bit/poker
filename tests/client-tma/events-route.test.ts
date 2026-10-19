import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventRow } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  announcePublishedEvents: vi.fn(),
  countActiveSignups: vi.fn(),
  findDuoInvitationEventIds: vi.fn(),
  getUserSignups: vi.fn(),
  listEvents: vi.fn(),
  publishDueEvents: vi.fn(),
  readClientLiveState: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/events/store", () => ({
  countActiveSignups: mocks.countActiveSignups,
  getUserSignups: mocks.getUserSignups,
  listEvents: mocks.listEvents,
}));

vi.mock("@/lib/events/duo", () => ({
  findDuoInvitationEventIds: mocks.findDuoInvitationEventIds,
}));

vi.mock("@/lib/events/scheduled-publication", () => ({
  announcePublishedEvents: mocks.announcePublishedEvents,
  publishDueEvents: mocks.publishDueEvents,
}));

vi.mock("@/lib/client-tma/live-state", () => ({
  readClientLiveState: mocks.readClientLiveState,
}));

vi.mock("next/server", () => ({
  after: (task: () => void) => task(),
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

/** A game that started at five this afternoon; the club played it until ten. */
const PLAYED_TONIGHT = mapEventRow({
  buy_in: 1500,
  id: "played",
  is_published: true,
  late_entry_until: "2026-09-20T18:00:00.000Z",
  starts_at: "2026-09-20T14:00:00.000Z",
  title: "MYSTERY BOUNTY",
});

const NEXT_WEEK = mapEventRow({
  buy_in: 1500,
  id: "next-week",
  is_published: true,
  starts_at: "2026-09-27T14:00:00.000Z",
  title: "ЧЕТВЕРГОВЫЙ",
});

function liveState() {
  return {
    activePlayers: 8,
    blindLevels: [],
    currentLevelIndex: 2,
    levelStartedAt: "2026-09-20T18:00:00.000Z",
    levelsVersion: "18:",
    pausedRemainingSeconds: null,
    registrationClosesAt: null,
    status: "running" as const,
    totalPlayers: 14,
    tournamentName: "Mystery Bounty",
  };
}

async function listShelf() {
  const { GET } = await import("@/app/api/client-tma/events/route");
  const response = await GET(
    new Request("http://localhost/api/client-tma/events"),
  );

  return (await response.json()) as { events: Array<{ id: string }> };
}

describe("the client's event board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase: {},
      user: { avatar_url: null, display_name: "Игрок", id: "account-1" },
    });
    mocks.listEvents.mockResolvedValue([PLAYED_TONIGHT, NEXT_WEEK]);
    mocks.publishDueEvents.mockResolvedValue([]);
    mocks.getUserSignups.mockResolvedValue([]);
    mocks.countActiveSignups.mockResolvedValue(new Map());
    mocks.findDuoInvitationEventIds.mockResolvedValue(new Set());
    mocks.readClientLiveState.mockResolvedValue(null);
  });

  // The club plays past midnight, so the poster has to outlive its own late entry.
  it("keeps tonight's game up while it is being played", async () => {
    vi.setSystemTime(new Date("2026-09-20T19:00:00.000Z"));
    mocks.readClientLiveState.mockResolvedValue(liveState());

    const { events } = await listShelf();

    expect(events.map((event) => event.id)).toContain("played");
  });

  // What went wrong on 20.09: the game ended at ten and the poster was still offering
  // seats at two in the morning.
  it("takes the game off the board once the desk has finished it", async () => {
    vi.setSystemTime(new Date("2026-09-20T22:20:00.000Z"));
    mocks.readClientLiveState.mockResolvedValue(null);

    const { events } = await listShelf();

    expect(events.map((event) => event.id)).toEqual(["next-week"]);
  });

  it("keeps the poster up before its game, whatever the clock says", async () => {
    vi.setSystemTime(new Date("2026-09-20T12:00:00.000Z"));

    const { events } = await listShelf();

    expect(events.map((event) => event.id)).toEqual(["played", "next-week"]);
  });

  // Late entry closes before the last hand; the seats are gone, the evening is not.
  it("keeps it up between the last entry and the finish", async () => {
    vi.setSystemTime(new Date("2026-09-20T18:30:00.000Z"));
    mocks.readClientLiveState.mockResolvedValue(liveState());

    const { events } = await listShelf();

    expect(events.map((event) => event.id)).toContain("played");
  });

  it("carries the live card with the posters", async () => {
    vi.setSystemTime(new Date("2026-09-20T19:00:00.000Z"));
    mocks.readClientLiveState.mockResolvedValue(liveState());

    const { GET } = await import("@/app/api/client-tma/events/route");
    const payload = (await (await GET(new Request("http://localhost/api/client-tma/events"))).json()) as {
      live: { tournamentName: string } | null;
    };

    expect(payload.live?.tournamentName).toBe("Mystery Bounty");
  });

  // The carousel at the top rides with the posters; a card past its end stays behind.
  it("carries the club's cards that are still being shown", async () => {
    vi.setSystemTime(new Date("2026-11-19T20:00:00.000Z"));
    const rows = [
      {
        id: "sochi",
        link_url: "https://t.me/majesticpokerptz/1197",
        message: "Majestic едет в Сочи",
        show_until: "2026-11-19T21:00:00.000Z",
      },
      { id: "old", link_url: null, message: "Вчерашнее", show_until: "2026-11-18T21:00:00.000Z" },
      { id: "season", link_url: null, message: "Новый сезон", show_until: null },
    ];
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase: {
        from(table: string) {
          if (table !== "club_home_announcements") throw new Error(`unexpected ${table}`);
          return { select: () => ({ order: () => ({ order: async () => ({ data: rows, error: null }) }) }) };
        },
      },
      user: { avatar_url: null, display_name: "Игрок", id: "account-1" },
    });

    const { GET } = await import("@/app/api/client-tma/events/route");
    const payload = (await (await GET(new Request("http://localhost/api/client-tma/events"))).json()) as {
      announcements: unknown[];
    };

    expect(payload.announcements).toEqual([
      { id: "sochi", linkUrl: "https://t.me/majesticpokerptz/1197", message: "Majestic едет в Сочи" },
      { id: "season", linkUrl: null, message: "Новый сезон" },
    ]);
  });

  it("still answers with the posters when the cards cannot be read", async () => {
    vi.setSystemTime(new Date("2026-09-20T12:00:00.000Z"));

    const { GET } = await import("@/app/api/client-tma/events/route");
    const payload = (await (await GET(new Request("http://localhost/api/client-tma/events"))).json()) as {
      announcements: unknown[];
      events: unknown[];
    };

    expect(payload.announcements).toEqual([]);
    expect(payload.events).toHaveLength(2);
  });
});
