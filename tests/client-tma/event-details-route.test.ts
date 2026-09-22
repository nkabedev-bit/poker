import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventRow } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  countActiveSignups: vi.fn(),
  findDuoInvitation: vi.fn(),
  getEvent: vi.fn(),
  getUserSignups: vi.fn(),
  loadPassHolds: vi.fn(),
  readClientLiveState: vi.fn(),
  readSignupBan: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/events/store", () => ({
  countActiveSignups: mocks.countActiveSignups,
  getEvent: mocks.getEvent,
  getUserSignups: mocks.getUserSignups,
}));

vi.mock("@/lib/events/duo", () => ({
  findDuoInvitation: mocks.findDuoInvitation,
}));

vi.mock("@/lib/free-entries/holds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/free-entries/holds")>()),
  loadPassHolds: mocks.loadPassHolds,
}));

vi.mock("@/lib/client-bot/signup-ban", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-bot/signup-ban")>()),
  readSignupBan: mocks.readSignupBan,
}));

vi.mock("@/lib/client-tma/live-state", () => ({
  readClientLiveState: mocks.readClientLiveState,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

/** Tuesday 22 September, 19:00 in Moscow. */
const TONIGHT = mapEventRow({
  buy_in: 1250,
  id: "event-1",
  is_published: true,
  starts_at: "2026-09-22T16:00:00.000Z",
  title: "DEEP STACK",
});

const NEXT_WEEK = mapEventRow({
  buy_in: 1250,
  id: "event-1",
  is_published: true,
  starts_at: "2026-09-29T16:00:00.000Z",
  title: "ЧЕТВЕРГОВЫЙ",
});

function liveState() {
  return {
    activePlayers: 18,
    blindLevels: [],
    currentLevelIndex: 12,
    levelStartedAt: "2026-09-22T19:03:00.000Z",
    levelsVersion: "24:",
    pausedRemainingSeconds: null,
    registrationClosesAt: null,
    status: "running" as const,
    totalPlayers: 22,
    tournamentName: "MAJESTIC | Series",
  };
}

function mySignup(status: string) {
  return {
    duoConfirmedAt: null,
    duoHostUserId: null,
    duoInviteToken: null,
    duoPartnerName: null,
    duoPartnerUserId: null,
    eventId: "event-1",
    status,
    ticketType: "regular",
    usePass: "none",
    userId: "account-1",
    waitlistOfferExpiresAt: null,
  };
}

async function openPoster() {
  const { GET } = await import("@/app/api/client-tma/events/[id]/route");
  const response = await GET(new Request("http://localhost/api/client-tma/events/event-1"), {
    params: Promise.resolve({ id: "event-1" }),
  });

  return {
    body: (await response.json()) as {
      event: { cancellationClosed: boolean; signedUp: boolean };
      live: unknown;
    },
    status: response.status,
  };
}

describe("the poster a player opens", () => {
  const supabase = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase,
      user: { free_entries: 0, id: "account-1", vip_free_entries: 0 },
    });
    mocks.getEvent.mockResolvedValue(TONIGHT);
    mocks.countActiveSignups.mockResolvedValue(new Map());
    mocks.getUserSignups.mockResolvedValue([mySignup("signed_up")]);
    mocks.findDuoInvitation.mockResolvedValue(null);
    mocks.loadPassHolds.mockResolvedValue([]);
    mocks.readSignupBan.mockResolvedValue(null);
    mocks.readClientLiveState.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // What went wrong on 22.09: the page learned about the game a minute after it opened,
  // so a player glancing at it never saw the tables at all.
  it("brings tonight's game along with its own poster", async () => {
    vi.setSystemTime(new Date("2026-09-22T19:10:00.000Z"));
    mocks.readClientLiveState.mockResolvedValue(liveState());

    const { body } = await openPoster();

    expect(body.live).toEqual(liveState());
    // The grid rides along once: the countdown runs on the phone from there.
    expect(mocks.readClientLiveState).toHaveBeenCalledWith(supabase, { includeLevels: true });
  });

  it("asks nothing about the game for another evening's poster", async () => {
    vi.setSystemTime(new Date("2026-09-22T19:10:00.000Z"));
    mocks.getEvent.mockResolvedValue(NEXT_WEEK);

    const { body } = await openPoster();

    expect(body.live).toBeNull();
    expect(mocks.readClientLiveState).not.toHaveBeenCalled();
  });

  it("keeps the poster when the game cannot be read", async () => {
    vi.setSystemTime(new Date("2026-09-22T19:10:00.000Z"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.readClientLiveState.mockRejectedValue(new Error("rpc down"));

    const { body, status } = await openPoster();

    expect(status).toBe(200);
    expect(body.live).toBeNull();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  // The game is on, and this player is still on the road: the ticket is theirs to give back.
  it("offers the ticket back mid-game to a player nobody has sat down yet", async () => {
    vi.setSystemTime(new Date("2026-09-22T19:10:00.000Z"));

    const { body } = await openPoster();

    expect(body.event).toMatchObject({ cancellationClosed: false, signedUp: true });
  });

  // The player who busted at ten was still offered "Отменить запись".
  it("stops offering it once the desk has sat the player down", async () => {
    vi.setSystemTime(new Date("2026-09-22T19:10:00.000Z"));
    mocks.getUserSignups.mockResolvedValue([mySignup("seated")]);

    const { body } = await openPoster();

    expect(body.event).toMatchObject({ cancellationClosed: true, signedUp: true });
  });
});
