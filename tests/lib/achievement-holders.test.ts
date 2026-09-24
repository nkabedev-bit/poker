import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACHIEVEMENTS_TOTAL } from "@/lib/client/achievements";
import {
  buildClubAchievements,
  type ClubAccount,
  type ClubResultRow,
} from "@/lib/players/achievement-holders";
import { buildNicknameKey } from "@/lib/players/nickname-key";

type Finisher = { knockouts?: number; name: string; telegramId?: number | null };

function startOf(day: number) {
  return `2026-09-${String(day).padStart(2, "0")}T16:00:00.000Z`;
}

/** One evening's table: the players in the order they finished, the winner first. */
function evening(day: number, finishers: Finisher[]): ClubResultRow[] {
  return finishers.map((finisher, index) => ({
    knockouts: finisher.knockouts ?? 0,
    place: index + 1,
    playerKey: buildNicknameKey(finisher.name),
    playerName: finisher.name,
    rebuys: null,
    startedAt: startOf(day),
    telegramId: finisher.telegramId ?? null,
  }));
}

function account(id: string, displayName: string, telegramId: number | null = null): ClubAccount {
  return { avatarUrl: `https://club.test/${id}.webp`, displayName, id, telegramId };
}

function namesOf(holders: Array<{ name: string }> | undefined) {
  return (holders ?? []).map((holder) => holder.name);
}

describe("buildClubAchievements", () => {
  it("counts everyone who has played, and nobody who has not", () => {
    const club = buildClubAchievements(
      evening(1, [{ name: "Anna", telegramId: 1 }, { name: "Boris" }, { name: "Cyril" }]),
      [account("anna", "Anna", 1), account("zed", "Zed", 9)],
    );

    expect(club.players).toBe(3);
    expect(namesOf(club.holders.debut)).toEqual(["Anna", "Boris", "Cyril"]);
  });

  // The same rule as the profile: a player who renamed themselves, or was typed in at the
  // desk under their nickname, is still one player with one history.
  it("gives an account its games under its Telegram id and under its nickname", () => {
    const club = buildClubAchievements(
      [
        ...evening(1, [{ name: "Old Nick", telegramId: 7 }, { name: "Rival" }]),
        ...evening(2, [{ name: "Kabedev" }, { name: "Rival" }]),
        ...evening(3, [{ name: "Kabedev", telegramId: 7 }, { name: "Rival" }]),
      ],
      [account("kabedev", "Kabedev", 7)],
    );

    expect(club.players).toBe(2);
    expect(club.holders["title-collector"]).toEqual([
      {
        accountId: "kabedev",
        avatarUrl: "https://club.test/kabedev.webp",
        key: "kabedev",
        name: "Kabedev",
        value: 3,
      },
    ]);
  });

  // Two players without Telegram both carry a null id; that must not make them one.
  it("finds a web account by its nickname alone", () => {
    const club = buildClubAchievements(evening(1, [{ name: "Олюшка" }, { name: "Guest" }]), [
      account("olya", "Олюшка"),
    ]);

    expect(club.players).toBe(2);
    expect(club.holders["first-trophy"]).toMatchObject([{ accountId: "olya", name: "Олюшка" }]);
    expect(club.holders.debut.find((holder) => holder.name === "Guest")).toMatchObject({
      accountId: null,
      avatarUrl: null,
    });
  });

  it("counts a player no account answers to by nickname, under its latest spelling", () => {
    const club = buildClubAchievements(
      [
        ...evening(1, [{ name: "trusty box" }]),
        ...evening(2, [{ name: "Trusty_Box" }]),
      ],
      [],
    );

    expect(club.players).toBe(1);
    expect(club.holders.debut).toEqual([
      { accountId: null, avatarUrl: null, key: "trustybox", name: "Trusty_Box", value: 2 },
    ]);
  });

  // 3rd is the bottom of a three-player table and the middle of a bigger one.
  it("reads the last place against the whole field", () => {
    const club = buildClubAchievements(
      [
        ...evening(1, [{ name: "Anna" }, { name: "Boris" }, { name: "Cyril" }]),
        ...evening(2, [{ name: "Boris" }, { name: "Anna" }, { name: "Dmitry" }, { name: "Cyril" }]),
      ],
      [],
    );

    expect(namesOf(club.holders["early-flight"])).toEqual(["Cyril"]);
    expect(club.holders["early-flight"][0].value).toBe(2);
  });

  it("puts the furthest along first, and orders a tie by name", () => {
    const club = buildClubAchievements(
      [
        ...evening(1, [{ name: "Cyril" }, { name: "Boris" }, { name: "Anna" }]),
        ...evening(2, [{ name: "Cyril" }, { name: "Anna" }]),
      ],
      [],
    );

    expect(namesOf(club.holders.debut)).toEqual(["Anna", "Cyril", "Boris"]);
    expect(club.holders.debut.map((holder) => holder.value)).toEqual([2, 2, 1]);
  });

  it("keeps a half knockout in the value a holder is ranked by", () => {
    const club = buildClubAchievements(evening(1, [{ knockouts: 5.5, name: "Anna" }]), []);

    expect(club.holders["precise-aim"]).toMatchObject([{ name: "Anna", value: 5.5 }]);
  });

  it("lists every achievement, even one nobody holds yet", () => {
    const club = buildClubAchievements(evening(1, [{ name: "Anna" }]), []);

    expect(Object.keys(club.holders)).toHaveLength(ACHIEVEMENTS_TOTAL);
    expect(club.holders.butcher).toEqual([]);
  });

  it("has nobody to count before the first game", () => {
    const club = buildClubAchievements([], [account("anna", "Anna", 1)]);

    expect(club.players).toBe(0);
    expect(club.holders.debut).toEqual([]);
  });
});

type RawResult = {
  knockouts: number;
  place: number | null;
  player_key: string;
  player_name: string;
  rebuys: number | null;
  started_at: string;
  telegram_id: number | null;
};

function storedEvening(day: number, names: string[]): RawResult[] {
  return names.map((name, index) => ({
    knockouts: 0,
    place: index + 1,
    player_key: buildNicknameKey(name),
    player_name: name,
    rebuys: null,
    started_at: startOf(day),
    telegram_id: null,
  }));
}

/**
 * The two tables the count reads, behind the few query calls it makes. Keeps a tally of
 * full readings and of head-only counts, which is what the cache is about.
 */
function fakeDatabase(results: RawResult[], options: { missingRebuys?: boolean } = {}) {
  const reads = { accounts: 0, counts: 0, results: 0 };

  const client = {
    from(table: string) {
      let columns = "";
      let head = false;
      let first = 0;
      let last = Number.POSITIVE_INFINITY;

      const answer = () => {
        const rows = table === "tournament_results" ? results : [];

        if (head) {
          reads.counts += 1;
          return { count: rows.length, data: null, error: null };
        }

        if (options.missingRebuys && columns.includes("rebuys")) {
          return {
            data: null,
            error: { message: "column tournament_results.rebuys does not exist" },
          };
        }

        if (first === 0) reads[table === "tournament_results" ? "results" : "accounts"] += 1;
        return { data: rows.slice(first, last + 1), error: null };
      };

      const query = {
        not: () => query,
        order: () => query,
        range: (from: number, to: number) => {
          first = from;
          last = to;
          return query;
        },
        select: (selected: string, selectOptions?: { head?: boolean }) => {
          columns = selected;
          head = Boolean(selectOptions?.head);
          return query;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(answer()).then(resolve, reject),
      };

      return query;
    },
  };

  return { client: client as unknown as SupabaseClient, reads };
}

describe("readClubAchievements", () => {
  // The reading is kept at module level; every test starts from a server that has none.
  async function loadReader() {
    vi.resetModules();
    return (await import("@/lib/players/achievement-holders")).readClubAchievements;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T20:00:00.000Z"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads the club once, then only counts its rows while nothing was played", async () => {
    const readClubAchievements = await loadReader();
    const { client, reads } = fakeDatabase(storedEvening(1, ["Anna", "Boris"]));

    await readClubAchievements(client);
    const club = await readClubAchievements(client);

    expect(club.players).toBe(2);
    expect(reads).toEqual({ accounts: 1, counts: 1, results: 1 });
  });

  it("reads again as soon as a finished game adds its results", async () => {
    const readClubAchievements = await loadReader();
    const results = storedEvening(1, ["Anna", "Boris"]);
    const { client, reads } = fakeDatabase(results);

    await readClubAchievements(client);
    results.push(...storedEvening(2, ["Cyril"]));
    const club = await readClubAchievements(client);

    expect(club.players).toBe(3);
    expect(reads.results).toBe(2);
  });

  // A place corrected in the admin leaves the row count as it was.
  it("reads again after an hour even when the count has not moved", async () => {
    const readClubAchievements = await loadReader();
    const { client, reads } = fakeDatabase(storedEvening(1, ["Anna"]));

    await readClubAchievements(client);
    vi.setSystemTime(new Date("2026-09-25T21:00:01.000Z"));
    await readClubAchievements(client);

    expect(reads).toEqual({ accounts: 2, counts: 0, results: 2 });
  });

  it("shares one reading between players who open the screen together", async () => {
    const readClubAchievements = await loadReader();
    const { client, reads } = fakeDatabase(storedEvening(1, ["Anna"]));

    await Promise.all([readClubAchievements(client), readClubAchievements(client)]);

    expect(reads.results).toBe(1);
  });

  it("still counts where the re-entries column has not been added yet", async () => {
    const readClubAchievements = await loadReader();
    const { client } = fakeDatabase(storedEvening(1, ["Anna", "Boris"]), { missingRebuys: true });

    const club = await readClubAchievements(client);

    expect(club.players).toBe(2);
    expect(club.holders["no-insurance"]).toEqual([]);
  });
});
