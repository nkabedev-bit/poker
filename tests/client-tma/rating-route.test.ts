import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapSeasonRow, type SeasonStanding } from "@/lib/seasons/season";

const mocks = vi.hoisted(() => ({
  computeSeasonStandings: vi.fn(),
  countGamesByNickname: vi.fn(),
  listSeasons: vi.fn(),
  loadCurrentTournamentContext: vi.fn(),
  loadPlayerAvatars: vi.fn(),
  readSeasonSnapshot: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/seasons/store", () => ({
  computeSeasonStandings: mocks.computeSeasonStandings,
  listSeasons: mocks.listSeasons,
  readSeasonSnapshot: mocks.readSeasonSnapshot,
}));

vi.mock("@/lib/players/avatars", () => ({ loadPlayerAvatars: mocks.loadPlayerAvatars }));
vi.mock("@/lib/players/games-played", () => ({
  countGamesByNickname: mocks.countGamesByNickname,
}));
vi.mock("@/lib/client-bot/server", () => ({
  loadCurrentTournamentContext: mocks.loadCurrentTournamentContext,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const APC = mapSeasonRow({
  counted_games: null,
  ends_on: "2026-10-06",
  id: "apc",
  parallel: true,
  starts_on: "2026-09-15",
  status: "open",
  title: "Отбор на кубок APC",
});

function line(overrides: Partial<SeasonStanding> & { playerName: string }): SeasonStanding {
  return { games: 1, knockouts: 0, place: 1, points: 100, telegramId: null, ...overrides };
}

type RatingLine = { avatarUrl: string | null; isMe: boolean; name: string };

async function openRating(
  viewer: { display_name: string; telegram_id: number | null },
  standings: SeasonStanding[],
) {
  mocks.requireClientTmaAuth.mockResolvedValue({
    supabase: {},
    user: { avatar_thumb_url: "https://club.test/me.webp", avatar_url: null, ...viewer },
  });
  mocks.computeSeasonStandings.mockResolvedValue(standings);

  const { GET } = await import("@/app/api/client-tma/rating/route");
  const response = await GET(new Request("http://localhost/api/client-tma/rating?season=apc"));

  return (await response.json()) as { me: RatingLine; players: RatingLine[] };
}

describe("the rating — which line is the player's own", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The route keeps a season's table for a minute; every test starts from a server
    // that has counted nothing yet.
    vi.resetModules();
    mocks.listSeasons.mockResolvedValue([APC]);
    mocks.loadPlayerAvatars.mockResolvedValue({ find: () => ({ thumbUrl: null, url: null }) });
    mocks.countGamesByNickname.mockResolvedValue(new Map());
    mocks.loadCurrentTournamentContext.mockResolvedValue(null);
  });

  // 15.09.2026: two accounts were swapped for an evening, and 1$ saw "ВЫ" — and his own
  // photo — on two lines: one by his Telegram id, the other by his nickname.
  it("marks only the line with the player's own Telegram id", async () => {
    const { me, players } = await openRating({ display_name: "1$", telegram_id: 887638103 }, [
      line({ place: 1, playerName: "Mers cls 055", points: 400, telegramId: 887638103 }),
      line({ place: 2, playerName: "1$", points: 100, telegramId: 1525327082 }),
    ]);

    expect(players.map((player) => player.isMe)).toEqual([true, false]);
    expect(players[1].avatarUrl).toBeNull();
    expect(me.name).toBe("Mers cls 055");
  });

  // A web sign-in has no Telegram id, and neither do games typed in at the door.
  it("finds the player by nickname when no line carries their Telegram id", async () => {
    const { players } = await openRating({ display_name: "Олюшка", telegram_id: null }, [
      line({ playerName: "Олюшка", telegramId: null }),
    ]);

    expect(players[0]).toMatchObject({ avatarUrl: "https://club.test/me.webp", isMe: true });
  });

  it("never takes another account's line for the player's own by its nickname", async () => {
    const { players } = await openRating({ display_name: "1$", telegram_id: 111 }, [
      line({ playerName: "1$", telegramId: 1525327082 }),
    ]);

    expect(players[0].isMe).toBe(false);
  });
});

describe("the rating — one count a minute for everyone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T22:00:00.000Z"));
    mocks.listSeasons.mockResolvedValue([APC]);
    mocks.loadPlayerAvatars.mockResolvedValue({ find: () => ({ thumbUrl: null, url: null }) });
    mocks.countGamesByNickname.mockResolvedValue(new Map());
    mocks.loadCurrentTournamentContext.mockResolvedValue(null);
    mocks.computeSeasonStandings.mockResolvedValue([
      line({ place: 1, playerName: "Kabedev", points: 400, telegramId: 7 }),
      line({ place: 2, playerName: "Chura", points: 300, telegramId: 8 }),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function openAs(telegramId: number) {
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase: {},
      user: { avatar_thumb_url: null, avatar_url: null, display_name: "", telegram_id: telegramId },
    });
    const { GET } = await import("@/app/api/client-tma/rating/route");
    const response = await GET(new Request("http://localhost/api/client-tma/rating?season=apc"));
    return (await response.json()) as { players: Array<{ isMe: boolean; name: string }> };
  }

  // After a game the whole room opens the table at once.
  it("counts the season once for everyone who opens it within the minute", async () => {
    const first = await openAs(7);
    const second = await openAs(8);

    expect(mocks.computeSeasonStandings).toHaveBeenCalledTimes(1);
    expect(first.players.map((player) => player.isMe)).toEqual([true, false]);
    expect(second.players.map((player) => player.isMe)).toEqual([false, true]);
  });

  it("counts it again once the minute is over, so a finished game shows up", async () => {
    await openAs(7);
    vi.setSystemTime(new Date("2026-09-25T22:01:01.000Z"));
    await openAs(7);

    expect(mocks.computeSeasonStandings).toHaveBeenCalledTimes(2);
  });

  it("keeps the accounts' Telegram ids off the wire", async () => {
    const { players } = await openAs(7);

    expect(players.every((player) => !("telegramId" in player))).toBe(true);
  });
});
