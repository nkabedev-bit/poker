import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";

const mocks = vi.hoisted(() => ({
  loadCurrentTournamentContext: vi.fn(),
  loadFavoriteHands: vi.fn(),
  loadPlayerAvatars: vi.fn(),
  readClientLiveState: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/client-bot/server", () => ({
  loadCurrentTournamentContext: mocks.loadCurrentTournamentContext,
}));

vi.mock("@/lib/client-tma/live-state", () => ({
  readClientLiveState: mocks.readClientLiveState,
}));

vi.mock("@/lib/players/avatars", () => ({
  loadPlayerAvatars: mocks.loadPlayerAvatars,
}));

vi.mock("@/lib/players/favorite-hand", () => ({
  loadFavoriteHands: mocks.loadFavoriteHands,
}));

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

/** Tonight's roster: one player with two and a half knockouts behind them. */
function tonight(isBounty: boolean) {
  const extras = mergeTournamentExtras({});

  return {
    extras: {
      ...extras,
      players: [
        {
          bountyCount: 2.5,
          id: "p1",
          name: "Chura",
          registrationNumber: 7,
          seat: 2,
          status: "active",
          table: 1,
        },
      ],
      settings: { ...extras.settings, isBounty },
    },
    tournament: { id: "t1", public_token: "token", starting_stack: 20000 },
  };
}

async function readTables() {
  const { GET } = await import("@/app/api/client-tma/live/tables/route");
  const response = await GET(new Request("http://localhost/api/client-tma/live/tables"));
  return response.json();
}

describe("the room as a player sees it", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase: {},
      user: { display_name: "Somebody", id: "account-me", telegram_id: 555 },
    });
    mocks.readClientLiveState.mockResolvedValue({ tournamentName: "Bounty Classic" });
    mocks.loadPlayerAvatars.mockResolvedValue({ find: () => ({ thumbUrl: null }) });
    mocks.loadFavoriteHands.mockResolvedValue({
      find: ({ name }: { name?: string | null }) => (name === "Chura" ? "QsTs" : null),
    });
  });

  it("carries each player's favourite hand to the tables", async () => {
    mocks.loadCurrentTournamentContext.mockResolvedValue(tonight(false));

    const room = await readTables();

    expect(room.tables[0].players[0]).toMatchObject({ hand: "QsTs", name: "Chura" });
  });

  it("carries each player's bounties when tonight pays them", async () => {
    mocks.loadCurrentTournamentContext.mockResolvedValue(tonight(true));

    const room = await readTables();

    expect(room.tables[0].players[0]).toMatchObject({ bounties: 2.5, name: "Chura" });
  });

  it("carries none when tonight pays no bounties", async () => {
    mocks.loadCurrentTournamentContext.mockResolvedValue(tonight(false));

    const room = await readTables();

    expect(room.tables[0].players[0]).toMatchObject({ bounties: null, name: "Chura" });
  });
});
