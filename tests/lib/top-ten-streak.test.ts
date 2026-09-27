import { describe, expect, it, vi } from "vitest";
import {
  countBestTopTenSeasonStreak,
  readClosedSeasonTopTens,
  type SeasonTopTen,
} from "@/lib/seasons/top-ten-streak";

function season(id: string, names: string[], telegramIds: Record<string, number> = {}): SeasonTopTen {
  return {
    id,
    rows: names.map((name) => ({ playerName: name, telegramId: telegramIds[name] ?? null })),
    startsOn: `2026-0${id}-01`,
  };
}

describe("countBestTopTenSeasonStreak", () => {
  it("counts closed seasons in a row finished in the top ten", () => {
    const seasons = [
      season("3", ["Chura"]),
      season("4", ["Chura", "Vera"]),
      season("5", ["Vera"]),
      season("6", ["Chura"]),
      season("7", ["Chura"]),
      season("8", ["CHURA!"]),
    ];

    // May breaks the first run of two; June to August is three, whatever the spelling.
    expect(countBestTopTenSeasonStreak(seasons, { nickname: "Chura", telegramId: null })).toBe(3);
  });

  // A renamed player is still found by the Telegram id the table kept.
  it("finds the player under an old nickname by their Telegram id", () => {
    const seasons = [season("3", ["Mr.Fish"], { "Mr.Fish": 7 }), season("4", ["Chura"], { Chura: 7 })];

    expect(countBestTopTenSeasonStreak(seasons, { nickname: "Chura", telegramId: 7 })).toBe(2);
  });

  it("is nought for a player never in a top ten", () => {
    expect(countBestTopTenSeasonStreak([season("3", ["Vera"])], { nickname: "Chura", telegramId: null })).toBe(0);
  });
});

describe("readClosedSeasonTopTens", () => {
  function database(seasons: unknown[], standings: unknown[]) {
    const asked: Array<{ table: string; seasonIds?: unknown[]; maxPlace?: unknown }> = [];

    const from = (table: string) => {
      const entry: { table: string; seasonIds?: unknown[]; maxPlace?: unknown } = { table };
      asked.push(entry);
      const query = {
        in: (_column: string, values: unknown[]) => {
          entry.seasonIds = values;
          return query;
        },
        lte: (_column: string, value: unknown) => {
          entry.maxPlace = value;
          return query;
        },
        order: () => query,
        select: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: table === "seasons" ? seasons : standings, error: null }),
      };
      return query;
    };

    return { asked, supabase: { from } as never };
  }

  it("reads the top ten of closed regular seasons, oldest first", async () => {
    const { asked, supabase } = database(
      [
        { id: "aug", parallel: false, starts_on: "2026-08-01", status: "closed", title: "Август" },
        { id: "apc", parallel: true, starts_on: "2026-09-15", status: "closed", title: "APC" },
        { id: "sep", parallel: false, starts_on: "2026-09-01", status: "open", title: "Сентябрь" },
        { id: "jul", parallel: false, starts_on: "2026-07-01", status: "closed", title: "Июль" },
      ],
      [
        { player_name: "Chura", season_id: "jul", telegram_id: 7 },
        { player_name: "Vera", season_id: "aug", telegram_id: null },
      ],
    );

    const seasons = await readClosedSeasonTopTens(supabase);

    expect(seasons.map((item) => item.id)).toEqual(["jul", "aug"]);
    expect(seasons[0]?.rows).toEqual([{ playerName: "Chura", telegramId: 7 }]);
    expect(asked.find((entry) => entry.table === "season_standings")).toMatchObject({
      maxPlace: 10,
      seasonIds: ["jul", "aug"],
    });
  });

  it("answers no seasons rather than failing the profile", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = {
      from: () => {
        throw new Error("network down");
      },
    } as never;

    expect(await readClosedSeasonTopTens(broken)).toEqual([]);
    warn.mockRestore();
  });
});
