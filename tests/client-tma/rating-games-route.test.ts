import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupSeasonLines, mapSeasonRow, type SeasonStanding } from "@/lib/seasons/season";
import type { SeasonGameRow } from "@/lib/seasons/store";

const mocks = vi.hoisted(() => ({
  listSeasons: vi.fn(),
  readSeasonLines: vi.fn(),
  readSeasonSnapshot: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/seasons/store", () => ({
  listSeasons: mocks.listSeasons,
  readSeasonLines: mocks.readSeasonLines,
  readSeasonSnapshot: mocks.readSeasonSnapshot,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const { GET } = await import("@/app/api/client-tma/rating/games/route");

const SOCHI = mapSeasonRow({
  counted_games: 2,
  ends_on: "2026-11-10",
  id: "sochi",
  parallel: true,
  starts_on: "2026-10-10",
  status: "open",
  title: "Отбор в Сочи",
});

function game(points: number, overrides: Partial<SeasonGameRow> = {}): SeasonGameRow {
  return {
    knockouts: 0,
    place: 5,
    playerName: "Nuts",
    points,
    startedAt: `2026-10-${10 + points % 20}T16:00:00.000Z`,
    telegramId: 7,
    title: "Phoenix",
    ...overrides,
  };
}

async function ask(query: string) {
  const response = await GET(new Request(`http://localhost/api/client-tma/rating/games${query}`));

  return { body: await response.json(), status: response.status };
}

describe("a player's games in a season", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T12:00:00.000Z"));
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase: {}, user: {} });
    mocks.listSeasons.mockResolvedValue([SOCHI]);
    mocks.readSeasonLines.mockResolvedValue(groupSeasonLines([game(10), game(30), game(20)]));
    mocks.readSeasonSnapshot.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers only a signed-in player", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({ error: new Response(null, { status: 401 }) });

    const response = await GET(new Request("http://localhost/x?season=sochi&player=nuts"));

    expect(response.status).toBe(401);
    expect(mocks.readSeasonLines).not.toHaveBeenCalled();
  });

  it("asks for a season and a player", async () => {
    expect((await ask("?player=nuts")).status).toBe(400);
    expect((await ask("?season=sochi")).status).toBe(400);
    expect((await ask("?season=sochi&player=---")).status).toBe(400);
  });

  it("does not know a season that does not exist", async () => {
    expect((await ask("?season=nope&player=nuts")).status).toBe(404);
  });

  it("splits the games by the season's rule, whatever spelling asks", async () => {
    const { body } = await ask("?season=sochi&player=NUTS");

    expect(body.countedGames).toBe(2);
    expect(body.counted.map((row: { points: number }) => row.points)).toEqual([30, 20]);
    expect(body.dropped.map((row: { points: number }) => row.points)).toEqual([10]);
  });

  it("serves what a row shows and nothing about the account", async () => {
    const { body } = await ask("?season=sochi&player=nuts");

    expect(Object.keys(body.counted[0]).sort()).toEqual(["place", "points", "startedAt", "title"]);
  });

  it("names the game to beat in a season still being played", async () => {
    const { body } = await ask("?season=sochi&player=nuts");

    expect(body.next).toEqual({ kind: "beat", points: 20 });
  });

  // The season closes at noon the day after its last evening.
  it("speaks of no next game once the last day is over", async () => {
    vi.setSystemTime(new Date("2026-11-11T06:00:00.000Z"));

    const { body } = await ask("?season=sochi&player=nuts");

    expect(body.next).toBeNull();
  });

  it("answers a player without games in the season with empty lists", async () => {
    const { body, status } = await ask("?season=sochi&player=stranger");

    expect(status).toBe(200);
    expect(body).toMatchObject({ counted: [], dropped: [], next: { kind: "any", left: 2 } });
  });

  describe("in a closed season", () => {
    const CLOSED = { ...SOCHI, status: "closed" as const };
    const frozen = (overrides: Partial<SeasonStanding>): SeasonStanding => ({
      games: 3,
      knockouts: 0,
      place: 1,
      playerName: "Старый ник",
      points: 50,
      telegramId: null,
      ...overrides,
    });

    beforeEach(() => {
      mocks.listSeasons.mockResolvedValue([CLOSED]);
    });

    it("speaks of no next game", async () => {
      const { body } = await ask("?season=sochi&player=nuts");

      expect(body.next).toBeNull();
      expect(body.counted).toHaveLength(2);
    });

    // The table keeps the name of the day it was frozen; the player has another one now.
    it("finds a renamed player through the account on the frozen line", async () => {
      mocks.readSeasonSnapshot.mockResolvedValue([frozen({ telegramId: 7 })]);

      const { body } = await ask(`?season=sochi&player=${encodeURIComponent("старыйник")}`);

      expect(body.counted.map((row: { points: number }) => row.points)).toEqual([30, 20]);
    });

    it("answers with empty lists when only the totals were kept", async () => {
      mocks.readSeasonSnapshot.mockResolvedValue([frozen({})]);
      mocks.readSeasonLines.mockResolvedValue([]);

      const { body, status } = await ask(`?season=sochi&player=${encodeURIComponent("старыйник")}`);

      expect(status).toBe(200);
      expect(body).toMatchObject({ counted: [], dropped: [], next: null });
    });
  });
});
