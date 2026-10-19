import { describe, expect, it, vi } from "vitest";
import {
  computeInviteStats,
  readInviteStats,
  summarizeInvitee,
} from "@/lib/players/invitees";

describe("computeInviteStats", () => {
  // A friend who came once to look is not yet somebody the club was brought.
  it("counts a newcomer once they come back for a second game", () => {
    expect(
      computeInviteStats([
        { games: 1, top9: 0 },
        { games: 2, top9: 0 },
        { games: 10, top9: 1 },
        { games: 0, top9: 0 },
      ]),
    ).toEqual({ invitedFinalists: 1, invitedPlayers: 2, invitedRegulars: 1 });
  });
});

describe("summarizeInvitee", () => {
  it("counts the newcomer's games and final tables by account or nickname", () => {
    const record = summarizeInvitee({ nickname: "Новенький", telegramId: 5 }, [
      { place: 3, playerKey: "другой", telegramId: 5 },
      { place: 14, playerKey: "новенький", telegramId: null },
      { place: 9, playerKey: "чужой", telegramId: 8 },
    ]);

    expect(record).toEqual({ games: 2, top9: 1 });
  });

  it("takes tenth place to the final table only on a ten-handed evening", () => {
    const record = summarizeInvitee({ nickname: "Новенький", telegramId: 5 }, [
      { finalTableSize: 10, place: 10, playerKey: "новенький", telegramId: 5 },
      { finalTableSize: 9, place: 10, playerKey: "новенький", telegramId: 5 },
      { place: 10, playerKey: "новенький", telegramId: 5 },
    ]);

    expect(record).toEqual({ games: 3, top9: 1 });
  });
});

describe("readInviteStats", () => {
  function database({
    invitees,
    games,
    inviteesError,
  }: {
    games?: unknown[];
    invitees?: unknown[];
    inviteesError?: { message: string };
  }) {
    const from = (table: string) => {
      const query = {
        eq: () => query,
        or: () => query,
        order: () => query,
        range: async () => ({ data: games ?? [], error: null }),
        select: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          resolve(
            table === "client_bot_users"
              ? { data: inviteesError ? null : invitees, error: inviteesError ?? null }
              : { data: games, error: null },
          ),
      };
      return query;
    };
    return { from } as never;
  }

  it("counts what the account's newcomers have done since", async () => {
    const stats = await readInviteStats(
      database({
        games: [
          { place: 4, player_key: "новенький", telegram_id: 5 },
          { place: 20, player_key: "новенький", telegram_id: 5 },
          { place: 30, player_key: "второй", telegram_id: null },
        ],
        invitees: [
          { display_name: "Новенький", telegram_id: 5 },
          { display_name: "Второй", telegram_id: null },
        ],
      }),
      "account-me",
    );

    expect(stats).toEqual({ invitedFinalists: 1, invitedPlayers: 1, invitedRegulars: 0 });
  });

  // The final table's size came with a migration applied by hand.
  it("counts the games nine-handed while the final table's size cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const games = [
      { place: 10, player_key: "новенький", telegram_id: 5 },
      { place: 12, player_key: "новенький", telegram_id: 5 },
    ];
    const from = (table: string) => {
      let columns = "";
      const query = {
        eq: () => query,
        or: () => query,
        order: () => query,
        range: async () =>
          columns.includes("final_table_size")
            ? { data: null, error: { message: "column tournament_results.final_table_size does not exist" } }
            : { data: games, error: null },
        select: (selected: string) => {
          columns = selected;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data: table === "client_bot_users" ? [{ display_name: "Новенький", telegram_id: 5 }] : games,
            error: null,
          }),
      };
      return query;
    };

    const stats = await readInviteStats({ from } as never, "account-me");

    expect(stats).toEqual({ invitedFinalists: 0, invitedPlayers: 1, invitedRegulars: 0 });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("has nothing to count for a profile without an account", async () => {
    expect(await readInviteStats(database({}), null)).toEqual({
      invitedFinalists: 0,
      invitedPlayers: 0,
      invitedRegulars: 0,
    });
  });

  // The link comes with a migration applied by hand.
  it("counts no invites while the link cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stats = await readInviteStats(
      database({ inviteesError: { message: "column referred_by_user_id does not exist" } }),
      "account-me",
    );

    expect(stats).toEqual({ invitedFinalists: 0, invitedPlayers: 0, invitedRegulars: 0 });
    warn.mockRestore();
  });
});
