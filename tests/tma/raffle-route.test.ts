import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import { RAFFLE_WIN_MESSAGE, RAFFLE_WIN_NOTICE_DELAY_MS } from "@/lib/raffle/raffle";
import type { TournamentPlayer } from "@/lib/timer/types";

const mocks = vi.hoisted(() => ({
  adjustFreeEntries: vi.fn(),
  /** What the route left to do once the response is gone. */
  afterResponse: [] as Array<() => Promise<void>>,
  appendFreeEntryGrant: vi.fn(),
  broadcastPublicState: vi.fn(),
  loadTournamentExtras: vi.fn(),
  notifyClientUser: vi.fn(),
  requireTmaAuth: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));
vi.mock("@/lib/tournament-extras", () => ({ loadTournamentExtras: mocks.loadTournamentExtras }));
vi.mock("@/lib/realtime/broadcast", () => ({ broadcastPublicState: mocks.broadcastPublicState }));
vi.mock("@/lib/free-entries/adjust", () => ({ adjustFreeEntries: mocks.adjustFreeEntries }));
vi.mock("@/lib/client-bot/notify", () => ({ notifyClientUser: mocks.notifyClientUser }));
vi.mock("@/lib/google-sheets", () => ({ appendFreeEntryGrant: mocks.appendFreeEntryGrant }));
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => {
    mocks.afterResponse.push(task);
  },
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

/** Runs what the route left for after the response, and lets `ms` go by for it. */
async function waitAfterResponse(ms: number) {
  const running = mocks.afterResponse.splice(0).map((task) => task());
  await vi.advanceTimersByTimeAsync(ms);
  return running;
}

function player(
  registrationNumber: number,
  overrides: Partial<TournamentPlayer> = {},
): TournamentPlayer {
  return {
    id: `p${registrationNumber}`,
    name: `Игрок ${registrationNumber}`,
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    rebuys: 0,
    registrationNumber,
    seat: null,
    stack: 20000,
    status: "active",
    table: 1,
    ...overrides,
  };
}

type AccountRow = {
  avatar_thumb_url: string | null;
  avatar_url: string | null;
  display_name: string | null;
  telegram_id: number | null;
};

function createSupabaseMock(accounts: AccountRow[] = []) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "tournament-1", public_token: "token-1" },
            error: null,
          })),
        })),
        // Where the faces on the reel come from.
        not: vi.fn(async () => ({ data: accounts, error: null })),
      })),
    })),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}

function request(kind: "regular" | "vip") {
  return new Request("http://localhost/api/tma/raffle", {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}

/** One player in the room, so the draw can only land on them. */
async function runDraw(kind: "regular" | "vip", only: TournamentPlayer, accounts: AccountRow[] = []) {
  const supabase = createSupabaseMock(accounts);
  mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 1 });
  mocks.loadTournamentExtras.mockResolvedValue(mergeTournamentExtras({ players: [only] }));

  const { POST } = await import("@/app/api/tma/raffle/route");
  const response = await POST(request(kind));

  return { body: await response.json(), response, supabase };
}

type StoredDraw = { faces?: Array<{ avatarUrl: string | null; name: string; number: number }> };

/** The draw as it was written down, which is what the screen will run. */
function storedDraw(supabase: ReturnType<typeof createSupabaseMock>): StoredDraw {
  const calls = supabase.rpc.mock.calls as unknown as Array<[string, { p_raffle: StoredDraw }]>;
  const call = calls.find(([name]) => name === "set_tournament_raffle");
  if (!call) throw new Error("Розыгрыш не записали");

  return call[1].p_raffle;
}

describe("POST /api/tma/raffle — telling the winner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.afterResponse.length = 0;
    mocks.adjustFreeEntries.mockResolvedValue({ after: 1, before: 0 });
    mocks.notifyClientUser.mockResolvedValue(true);
    mocks.appendFreeEntryGrant.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tells the free pass winner it is already in the app", async () => {
    const { body } = await runDraw("regular", player(4, { accountId: "account-4", telegramId: 44 }));
    await waitAfterResponse(RAFFLE_WIN_NOTICE_DELAY_MS);

    expect(body.raffle.prize).toBe("granted");
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      expect.anything(),
      "account-4",
      RAFFLE_WIN_MESSAGE.regular,
    );
  });

  it("promises the VIP winner a partner certificate", async () => {
    const { body } = await runDraw("vip", player(23, { accountId: "account-23", telegramId: 23 }));
    await waitAfterResponse(RAFFLE_WIN_NOTICE_DELAY_MS);

    expect(body.raffle.prize).toBe("none");
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      expect.anything(),
      "account-23",
      RAFFLE_WIN_MESSAGE.vip,
    );
  });

  // Sent at once, the message reached the winner's phone while the reel in the hall was
  // still turning: the winner knew before the room did.
  it("lets the reel stop before the winner hears about it", async () => {
    await runDraw("regular", player(4, { accountId: "account-4", telegramId: 44 }));

    expect(mocks.broadcastPublicState).toHaveBeenCalledWith("token-1");
    await waitAfterResponse(RAFFLE_WIN_NOTICE_DELAY_MS - 1);
    expect(mocks.notifyClientUser).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.notifyClientUser).toHaveBeenCalledTimes(1);
  });

  // The message sends the player to look in the app; an uncredited pass would send them
  // to an empty profile.
  it("stays quiet when the pass could not be credited", async () => {
    mocks.adjustFreeEntries.mockResolvedValue(null);

    const { body } = await runDraw("regular", player(4, { accountId: "account-4", telegramId: 44 }));
    await waitAfterResponse(RAFFLE_WIN_NOTICE_DELAY_MS);

    expect(body.raffle.prize).toBe("manual");
    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });

  it("stays quiet for a player the admin seated by hand", async () => {
    await runDraw("vip", player(23));
    await waitAfterResponse(RAFFLE_WIN_NOTICE_DELAY_MS);

    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });

  // The draw is written down and the prize is paid in before this runs.
  it("keeps the draw when the bot will not deliver", async () => {
    mocks.notifyClientUser.mockRejectedValue(new Error("bot blocked"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { body, response } = await runDraw(
      "regular",
      player(4, { accountId: "account-4", telegramId: 44 }),
    );
    const running = await waitAfterResponse(RAFFLE_WIN_NOTICE_DELAY_MS);
    await Promise.all(running);

    expect(response.status).toBe(200);
    expect(body.raffle.winnerNumber).toBe(4);
    expect(mocks.broadcastPublicState).toHaveBeenCalledWith("token-1");
    expect(error).toHaveBeenCalledWith("Failed to tell the raffle winner", expect.any(Error));
    error.mockRestore();
  });
});

describe("POST /api/tma/raffle — the faces on the reel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adjustFreeEntries.mockResolvedValue({ after: 1, before: 0 });
    mocks.notifyClientUser.mockResolvedValue(true);
    mocks.appendFreeEntryGrant.mockResolvedValue(undefined);
  });

  // Frozen with the draw rather than looked up by the screen: a player seated while the
  // reel is turning must not change what the room is watching.
  it("writes the club's photo down with the draw", async () => {
    const { supabase } = await runDraw("regular", player(4, { telegramId: 555 }), [
      {
        avatar_thumb_url: "https://club.example/thumbs/4.webp",
        avatar_url: "https://club.example/faces/4.jpg",
        display_name: "Игрок 4",
        telegram_id: 555,
      },
    ]);

    expect(storedDraw(supabase).faces).toEqual([
      { avatarUrl: "https://club.example/faces/4.jpg", name: "Игрок 4", number: 4 },
    ]);
  });

  // Somebody the admin seated by hand has no account, so there is no face to find —
  // the reel runs their nickname instead, and the draw says so.
  it("leaves the face empty for a player the club has no photo of", async () => {
    const { supabase } = await runDraw("regular", player(9));

    expect(storedDraw(supabase).faces).toEqual([
      { avatarUrl: null, name: "Игрок 9", number: 9 },
    ]);
  });
});

describe("POST /api/tma/raffle — who stands in the draw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adjustFreeEntries.mockResolvedValue({ after: 1, before: 0 });
    mocks.notifyClientUser.mockResolvedValue(true);
    mocks.appendFreeEntryGrant.mockResolvedValue(undefined);
  });

  it("puts VIP numbers on the free pass wheel too", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 1 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({ players: [player(1), player(2), player(21), player(22)] }),
    );

    const { POST } = await import("@/app/api/tma/raffle/route");
    const body = await (await POST(request("regular"))).json();

    expect(body.raffle.numbers).toEqual([1, 2, 21, 22]);
  });

  it("keeps regular numbers off the VIP wheel", async () => {
    const supabase = createSupabaseMock();
    mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 1 });
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({ players: [player(1), player(2), player(21), player(22)] }),
    );

    const { POST } = await import("@/app/api/tma/raffle/route");
    const body = await (await POST(request("vip"))).json();

    expect(body.raffle.numbers).toEqual([21, 22]);
  });
});
