import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACHIEVEMENTS_TOTAL, EMPTY_PLAYER_STATS, getAchievements } from "@/lib/client/achievements";
import type { AchievementHolder, ClubAchievements } from "@/lib/players/achievement-holders";

const mocks = vi.hoisted(() => ({
  readClubAchievements: vi.fn(),
  requireClientSignedIn: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-signed-in", () => ({
  requireClientSignedIn: mocks.requireClientSignedIn,
}));
vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/players/achievement-holders", () => ({
  readClubAchievements: mocks.readClubAchievements,
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const { GET: getRarity } = await import("@/app/api/client-tma/achievements/route");
const { GET: getHolders } = await import("@/app/api/client-tma/achievements/[id]/route");

function holder(overrides: Partial<AchievementHolder> & { name: string }): AchievementHolder {
  return { accountId: null, avatarUrl: null, key: overrides.name.toLowerCase(), value: 1, ...overrides };
}

function clubWith(holders: Record<string, AchievementHolder[]>, players: number): ClubAchievements {
  const everyAchievement = Object.fromEntries(
    getAchievements(EMPTY_PLAYER_STATS).map((achievement) => [achievement.id, []]),
  );

  return { holders: { ...everyAchievement, ...holders }, players };
}

function openHolders(id: string) {
  return getHolders(new Request(`http://localhost/api/client-tma/achievements/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe("client mini-app API: редкость достижений", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireClientSignedIn.mockReturnValue({ error: null });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: {}, user: { id: "me" } });
  });

  it("answers how many players hold each achievement, out of everyone who played", async () => {
    mocks.readClubAchievements.mockResolvedValue(
      clubWith(
        {
          debut: [holder({ name: "Anna" }), holder({ name: "Boris" })],
          "first-trophy": [holder({ name: "Anna" })],
        },
        2,
      ),
    );

    const response = await getRarity(new Request("http://localhost/api/client-tma/achievements"));
    const body = (await response.json()) as { holders: Record<string, number>; players: number };

    expect(body.players).toBe(2);
    expect(body.holders).toMatchObject({ butcher: 0, debut: 2, "first-trophy": 1 });
    expect(Object.keys(body.holders)).toHaveLength(ACHIEVEMENTS_TOTAL);
  });

  it("turns away a visitor who is not signed in", async () => {
    mocks.requireClientSignedIn.mockReturnValue({
      error: Response.json({ error: "Not signed in" }, { status: 401 }),
    });

    const response = await getRarity(new Request("http://localhost/api/client-tma/achievements"));

    expect(response.status).toBe(401);
    expect(mocks.readClubAchievements).not.toHaveBeenCalled();
  });

  it("says so when the club could not be counted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.readClubAchievements.mockRejectedValue(new Error("statement timeout"));

    const response = await getRarity(new Request("http://localhost/api/client-tma/achievements"));

    expect(response.status).toBe(500);
  });
});

describe("client mini-app API: у кого есть достижение", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: {}, user: { id: "me" } });
  });

  it("lists the holders and marks the player's own line by account", async () => {
    mocks.readClubAchievements.mockResolvedValue(
      clubWith(
        {
          "title-collector": [
            holder({ accountId: "someone", avatarUrl: "https://club.test/a.webp", name: "Anna", value: 5 }),
            holder({ accountId: "me", name: "Kabedev", value: 3 }),
            holder({ name: "Guest", value: 3 }),
          ],
        },
        12,
      ),
    );

    const response = await openHolders("title-collector");
    const body = (await response.json()) as {
      holders: Array<Record<string, unknown>>;
      players: number;
    };

    expect(body.players).toBe(12);
    expect(body.holders).toEqual([
      { avatarUrl: "https://club.test/a.webp", isMe: false, key: "anna", name: "Anna", value: 5 },
      { avatarUrl: null, isMe: true, key: "kabedev", name: "Kabedev", value: 3 },
      { avatarUrl: null, isMe: false, key: "guest", name: "Guest", value: 3 },
    ]);
  });

  it("answers 404 for an achievement the club does not hand out", async () => {
    const response = await openHolders("free-drinks");

    expect(response.status).toBe(404);
    expect(mocks.readClubAchievements).not.toHaveBeenCalled();
  });
});
