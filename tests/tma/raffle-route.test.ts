import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import { RAFFLE_WIN_MESSAGE } from "@/lib/raffle/raffle";
import type { TournamentPlayer } from "@/lib/timer/types";

const mocks = vi.hoisted(() => ({
  adjustFreeEntries: vi.fn(),
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
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

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

function createSupabaseMock() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "tournament-1", public_token: "token-1" },
            error: null,
          })),
        })),
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
async function runDraw(kind: "regular" | "vip", only: TournamentPlayer) {
  const supabase = createSupabaseMock();
  mocks.requireTmaAuth.mockResolvedValue({ supabase, userId: 1 });
  mocks.loadTournamentExtras.mockResolvedValue(mergeTournamentExtras({ players: [only] }));

  const { POST } = await import("@/app/api/tma/raffle/route");
  const response = await POST(request(kind));

  return { body: await response.json(), response };
}

describe("POST /api/tma/raffle — telling the winner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adjustFreeEntries.mockResolvedValue({ after: 1, before: 0 });
    mocks.notifyClientUser.mockResolvedValue(true);
    mocks.appendFreeEntryGrant.mockResolvedValue(undefined);
  });

  it("tells the free pass winner it is already in the app", async () => {
    const { body } = await runDraw("regular", player(4, { accountId: "account-4", telegramId: 44 }));

    expect(body.raffle.prize).toBe("granted");
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      expect.anything(),
      "account-4",
      RAFFLE_WIN_MESSAGE.regular,
    );
  });

  it("promises the VIP winner a partner certificate", async () => {
    const { body } = await runDraw("vip", player(23, { accountId: "account-23", telegramId: 23 }));

    expect(body.raffle.prize).toBe("none");
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(
      expect.anything(),
      "account-23",
      RAFFLE_WIN_MESSAGE.vip,
    );
  });

  // The message sends the player to look in the app; an uncredited pass would send them
  // to an empty profile.
  it("stays quiet when the pass could not be credited", async () => {
    mocks.adjustFreeEntries.mockResolvedValue(null);

    const { body } = await runDraw("regular", player(4, { accountId: "account-4", telegramId: 44 }));

    expect(body.raffle.prize).toBe("manual");
    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });

  it("stays quiet for a player the admin seated by hand", async () => {
    await runDraw("vip", player(23));

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

    expect(response.status).toBe(200);
    expect(body.raffle.winnerNumber).toBe(4);
    expect(mocks.broadcastPublicState).toHaveBeenCalledWith("token-1");
    error.mockRestore();
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
