import { describe, expect, it } from "vitest";
import {
  groupPastGames,
  PAST_GAMES_PAGE_ROWS,
  PAST_GAMES_SINCE,
  readPastGames,
  type PastGameRow,
} from "@/lib/results/club-games";

function evening(startedAt: string, names: string[], eventId: string | null = null): PastGameRow[] {
  return names.map((name, index) => ({
    eventId,
    place: index + 1,
    playerName: name,
    startedAt,
    telegramId: null,
    title: `Турнир ${startedAt.slice(8, 10)}`,
  }));
}

describe("groupPastGames", () => {
  it("makes one game of each evening, newest first, with its field and its winner", () => {
    const page = groupPastGames(
      [...evening("2026-09-27T15:00:00+00:00", ["Chura", "Vera", "Fil"], "event-27"), ...evening("2026-09-25T15:00:00+00:00", ["Vera", "Chura"])],
      false,
    );

    expect(page.games).toEqual([
      {
        eventId: "event-27",
        players: 3,
        startedAt: "2026-09-27T15:00:00+00:00",
        title: "Турнир 27",
        winner: { name: "Chura", telegramId: null },
      },
      {
        eventId: null,
        players: 2,
        startedAt: "2026-09-25T15:00:00+00:00",
        title: "Турнир 25",
        winner: { name: "Vera", telegramId: null },
      },
    ]);
    expect(page.next).toBeNull();
  });

  // A full page may have cut its oldest game short: that one waits for the next page.
  it("leaves the oldest game of a full page for the next one", () => {
    const page = groupPastGames(
      [...evening("2026-09-27T15:00:00+00:00", ["A", "B"]), ...evening("2026-09-25T15:00:00+00:00", ["C"])],
      true,
    );

    expect(page.games.map((game) => game.startedAt)).toEqual(["2026-09-27T15:00:00+00:00"]);
    expect(page.next).toBe("2026-09-25T15:00:00+00:00");
  });

  it("keeps a lone game rather than asking for it forever", () => {
    const page = groupPastGames(evening("2026-09-27T15:00:00+00:00", ["A", "B"]), true);

    expect(page.games).toHaveLength(1);
    expect(page.next).toBeNull();
  });

  it("names no winner for a game nobody finished first in", () => {
    const rows = evening("2026-09-27T15:00:00+00:00", ["A", "B"]).map((row) => ({ ...row, place: null }));

    expect(groupPastGames(rows, false).games[0]?.winner).toBeNull();
  });
});

describe("readPastGames", () => {
  function database(rows: unknown[]) {
    const asked: Record<string, unknown> = {};
    const query = {
      gte: (column: string, value: unknown) => {
        asked.gte = [column, value];
        return query;
      },
      lte: (column: string, value: unknown) => {
        asked.lte = [column, value];
        return query;
      },
      order: () => query,
      range: async (from: number, to: number) => {
        asked.range = [from, to];
        return { data: rows, error: null };
      },
      select: () => query,
    };
    return { asked, supabase: { from: () => query } as never };
  }

  it("reads the club's games since September, from the game asked for", async () => {
    const { asked, supabase } = database([
      { event_id: null, place: 1, player_name: "Chura", started_at: "2026-09-20T15:00:00+00:00", telegram_id: 7, title: "Вторник" },
    ]);

    const page = await readPastGames(supabase, { from: "2026-09-20T15:00:00+00:00" });

    expect(asked).toEqual({
      gte: ["started_at", PAST_GAMES_SINCE],
      lte: ["started_at", "2026-09-20T15:00:00+00:00"],
      range: [0, PAST_GAMES_PAGE_ROWS - 1],
    });
    expect(page.games[0]?.winner).toEqual({ name: "Chura", telegramId: 7 });
  });
});
