import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PLAYER_STATS, getAchievements, type PlayerStats } from "@/lib/client/achievements";

const mocks = vi.hoisted(() => ({
  buildPlayerStats: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));
vi.mock("@/lib/client-bot/server", () => ({ loadCurrentTournamentContext: async () => null }));
vi.mock("@/lib/events/store", () => ({ getUserSignupsWithEvents: async () => [] }));
vi.mock("@/lib/free-entries/holds", () => ({
  countFreePasses: () => ({ regular: 0, vip: 0 }),
  loadPassHolds: async () => [],
}));
vi.mock("@/lib/players/medal-counts", () => ({
  countMedalsFromResults: async () => ({}),
  readArchiveMedals: async () => ({}),
}));
vi.mock("@/lib/players/profile", () => ({
  buildPlayerStats: mocks.buildPlayerStats,
  readPlayerGames: async () => [],
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const { GET } = await import("@/app/api/client-tma/me/route");

/** The accounts table, asked only for the medal counters kept on the account. */
const supabase = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  }),
};

// Every counter different from the others, so a field sent under the wrong name shows.
const COUNTED: PlayerStats = {
  bestMissStreak: 5,
  bestTop9Streak: 3,
  bestTournamentBounty: 8.5,
  cleanPodiums: 1,
  comebackWins: 2,
  eliminations: 20,
  games: 30,
  lastPlace: 4,
  top3: 6,
  top9: 12,
  wins: 7,
};

async function openOwnProfile() {
  const response = await GET(new Request("http://localhost/api/client-tma/me"));
  return (await response.json()) as { stats: PlayerStats };
}

describe("client mini-app API: свой профиль", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase,
      user: { display_name: "Kabedev", id: "me", telegram_id: 7 },
    });
    mocks.buildPlayerStats.mockResolvedValue(COUNTED);
  });

  // 05.09.2026 "Без страховки" and "Возвращение" were added to the achievements but not to
  // this answer, and a player's own screen kept both at 0 while everyone else's showed them.
  it("sends every counter the achievements are read from", async () => {
    const { stats } = await openOwnProfile();

    expect(Object.keys(stats).sort()).toEqual(Object.keys(EMPTY_PLAYER_STATS).sort());
    expect(stats).toEqual(COUNTED);
  });

  it("lights up a clean podium and a comeback on the player's own screen", async () => {
    const { stats } = await openOwnProfile();
    const earned = getAchievements({ ...EMPTY_PLAYER_STATS, ...stats })
      .filter((achievement) => achievement.earned)
      .map((achievement) => achievement.id);

    expect(earned).toEqual(expect.arrayContaining(["no-insurance", "comeback"]));
  });
});
