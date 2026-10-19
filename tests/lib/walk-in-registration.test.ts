import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

const mocks = vi.hoisted(() => ({ saveTournamentExtras: vi.fn() }));

vi.mock("@/lib/tournament-extras", () => ({
  saveTournamentExtras: mocks.saveTournamentExtras,
}));

const {
  appendTournamentPlayerWithRegistrationNumber,
  appendUnseatedTournamentPlayer,
  assignRegistrationNumber,
  buildNumbersExhaustedMessage,
  buildRegistrationFullMessage,
  ensureRegistrationNumber,
  isRegistrationNumbersExhaustedError,
} = await import("@/lib/tournament-player-registration");

const supabase = {} as never;

function player(over: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id: "walk-in",
    name: "Гость",
    rebuys: 0,
    seat: null,
    stack: 10000,
    status: "active",
    table: null,
    ...over,
  };
}

function extras(over: Partial<TournamentExtras> = {}): TournamentExtras {
  return {
    ...defaultTournamentExtras,
    settings: { ...defaultTournamentExtras.settings, maxPlayersPerTable: 9, tablesCount: 3 },
    ...over,
  };
}

/** What the helper handed to the store. */
function savedPlayers(): TournamentPlayer[] {
  return mocks.saveTournamentExtras.mock.calls.at(-1)?.[0].players ?? [];
}

describe("a walk-in on the roster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveTournamentExtras.mockResolvedValue(undefined);
  });

  // The number is handed out in the order players actually sit down.
  it("goes on with no chair and no number", async () => {
    const added = await appendUnseatedTournamentPlayer({
      extras: extras(),
      player: player(),
      redirectTo: "/tma/players",
      supabase,
    });

    expect(added).toMatchObject({ registrationNumber: null, seat: null, table: null });
    expect(savedPlayers()).toHaveLength(1);
  });

  it("keeps the marker a regular guest carries between games", async () => {
    const added = await appendUnseatedTournamentPlayer({
      extras: extras({ playerLabels: { гость: "дилер" } }),
      player: player(),
      redirectTo: "/tma/players",
      supabase,
    });

    expect(added.label).toBe("дилер");
  });

  it("refuses to seat more players than the room holds", async () => {
    const full = extras({
      settings: { ...defaultTournamentExtras.settings, maxPlayersPerTable: 1, tablesCount: 1 },
      players: [player({ id: "already-here", seat: 1, table: 1 })],
    });

    await expect(
      appendUnseatedTournamentPlayer({
        extras: full,
        player: player(),
        redirectTo: "/tma/players",
        supabase,
      }),
    ).rejects.toThrow(/capacity/i);
    expect(mocks.saveTournamentExtras).not.toHaveBeenCalled();
  });

  // A busted player has left their chair to the next walk-in: a six-handed room that lost
  // a player still lets the late one in.
  it("counts the chairs against the players still at the tables", async () => {
    const room = extras({
      settings: { ...defaultTournamentExtras.settings, maxPlayersPerTable: 1, tablesCount: 1 },
      players: [player({ id: "busted", status: "eliminated" })],
    });

    const added = await appendUnseatedTournamentPlayer({
      extras: room,
      player: player(),
      redirectTo: "/tma/players",
      supabase,
    });

    expect(added.name).toBe("Гость");
  });

  it("counts a chair the desk brought over tonight", async () => {
    const room = extras({
      settings: { ...defaultTournamentExtras.settings, maxPlayersPerTable: 1, tablesCount: 1 },
      players: [player({ id: "already-here", seat: 1, table: 1 })],
      tableFormats: [2],
    });

    const added = await appendUnseatedTournamentPlayer({
      extras: room,
      player: player(),
      redirectTo: "/tma/players",
      supabase,
    });

    expect(added.name).toBe("Гость");
  });

  // A walk-in waiting for a chair has not taken one: the free chair is not theirs until
  // they are sat in it, so the room does not read full because of them.
  it("does not count a player still waiting for a chair", async () => {
    const room = extras({
      settings: { ...defaultTournamentExtras.settings, maxPlayersPerTable: 2, tablesCount: 1 },
      players: [player({ id: "seated", seat: 1, table: 1 }), player({ id: "waiting" })],
    });

    const added = await appendUnseatedTournamentPlayer({
      extras: room,
      player: player(),
      redirectTo: "/tma/players",
      supabase,
    });

    expect(added.name).toBe("Гость");
  });
});

/**
 * The number patch goes through the row lock rather than writing the roster back, so the
 * stub answers the way `update_tournament_player` does: the player it was asked for, with
 * the patch merged in.
 */
function patchingSupabase(players: TournamentPlayer[]) {
  const rpc = vi.fn(
    async (_name: string, args: { p_patch: Partial<TournamentPlayer>; p_player_id: string }) => ({
      data: { ...players.find((item) => item.id === args.p_player_id), ...args.p_patch },
      error: null,
    }),
  );

  return { rpc, supabase: { rpc } as never };
}

describe("the evening's numbers", () => {
  it("hands out 1 to the first player", () => {
    expect(assignRegistrationNumber(player({ table: 1 }), []).registrationNumber).toBe(1);
  });

  it("takes the next number nobody holds", () => {
    const numbered = assignRegistrationNumber(player({ table: 1 }), [
      player({ id: "one", registrationNumber: 1 }),
      player({ id: "two", registrationNumber: 2 }),
    ]);

    expect(numbered.registrationNumber).toBe(3);
  });

  // The numbers run on past 20 like any other: nothing is kept aside any more.
  it("runs straight on from 20 to 21", () => {
    const numbered = assignRegistrationNumber(
      player({ table: 3 }),
      Array.from({ length: 20 }, (_, index) =>
        player({ id: `player-${index}`, registrationNumber: index + 1 }),
      ),
    );

    expect(numbered.registrationNumber).toBe(21);
  });

  // A player who busted an hour ago is still in the draw and still on the club's sheet,
  // so their number is not free to hand to the next walk-in.
  it("counts a knocked-out player's number as taken", () => {
    const numbered = assignRegistrationNumber(player({ table: 1 }), [
      player({ id: "out", registrationNumber: 1, status: "eliminated" }),
    ]);

    expect(numbered.registrationNumber).toBe(2);
  });

  // A number handed back earlier in the evening is not given to somebody else.
  it("keeps a number given back out of circulation", () => {
    const numbered = assignRegistrationNumber(player({ table: 1 }), [
      player({ id: "moved", previousRegistrationNumbers: [1], registrationNumber: 24 }),
    ]);

    expect(numbered.registrationNumber).toBe(2);
  });

  it("refuses once 1–40 are all out, in words the desk can act on", () => {
    const evening = Array.from({ length: 39 }, (_, index) =>
      player({ id: `player-${index}`, registrationNumber: index + 1 }),
    );
    evening.push(player({ id: "moved", previousRegistrationNumbers: [40], registrationNumber: null }));

    let refusal: unknown = null;
    try {
      assignRegistrationNumber(player({ table: 1 }), evening);
    } catch (error) {
      refusal = error;
    }

    expect(isRegistrationNumbersExhaustedError(refusal)).toBe(true);
    expect(buildNumbersExhaustedMessage()).toBe(
      "Номера 1–40 закончились. Освободите номер, чтобы посадить игрока",
    );
  });
});

describe("a walk-in the desk sits down", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A walk-in seated from their player card has no number at all yet: this is what puts
  // them in the draw.
  it("gets the next free number", async () => {
    const players = [player({ id: "first", registrationNumber: 1 }), player({ table: 1 })];

    const numbered = await ensureRegistrationNumber({
      extras: extras({ players }),
      playerId: "walk-in",
      supabase: patchingSupabase(players).supabase,
      tournamentId: "tournament-1",
    });

    expect(numbered?.registrationNumber).toBe(2);
  });

  // One player is patched under the row lock: a knockout recorded in between must not be
  // overwritten by a roster read a moment before it.
  it("patches that one player rather than writing the roster back", async () => {
    const players = [player({ table: 1 })];
    const { rpc, supabase: stub } = patchingSupabase(players);

    await ensureRegistrationNumber({
      extras: extras({ players }),
      playerId: "walk-in",
      supabase: stub,
      tournamentId: "tournament-1",
    });

    expect(rpc).toHaveBeenCalledWith("update_tournament_player", {
      p_patch: { registrationNumber: 1 },
      p_player_id: "walk-in",
      p_tournament_id: "tournament-1",
    });
    expect(mocks.saveTournamentExtras).not.toHaveBeenCalled();
  });

  // A number is what the club calls a player all evening; it does not change under them.
  it("leaves a number already given alone", async () => {
    const players = [player({ registrationNumber: 7, table: 1 })];
    const { rpc, supabase: stub } = patchingSupabase(players);

    const numbered = await ensureRegistrationNumber({
      extras: extras({ players }),
      playerId: "walk-in",
      supabase: stub,
      tournamentId: "tournament-1",
    });

    expect(numbered?.registrationNumber).toBe(7);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does nothing for a player who is not there", async () => {
    await expect(
      ensureRegistrationNumber({
        extras: extras(),
        playerId: "nobody",
        supabase: patchingSupabase([]).supabase,
        tournamentId: "tournament-1",
      }),
    ).resolves.toBeNull();
  });
});

describe("an evening that has run through its numbers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveTournamentExtras.mockResolvedValue(undefined);
  });

  // Chairs stand empty — most of the forty have busted — but every number of the evening
  // has been called, and a forty-first player could not be called by any.
  it("refuses the forty-first player of the evening, whatever chairs stand empty", async () => {
    const evening = extras({
      players: Array.from({ length: 40 }, (_, index) =>
        player({
          id: `player-${index}`,
          registrationNumber: index + 1,
          status: index < 30 ? "eliminated" : "active",
        }),
      ),
    });

    const refusal = appendUnseatedTournamentPlayer({
      extras: evening,
      player: player({ id: "late" }),
      redirectTo: "/tma/players",
      supabase,
    });

    await expect(refusal).rejects.toMatchObject({ reason: "evening" });
    expect(buildRegistrationFullMessage(await refusal.catch((error) => error), 0)).toBe(
      "За вечер уже 40 игроков — номеров больше нет",
    );
    expect(mocks.saveTournamentExtras).not.toHaveBeenCalled();
  });

  it("reads the database's own ceiling as the evening's", async () => {
    // supabase-js hands back its errors as Error instances.
    const rpc = vi.fn(async () => ({
      data: null,
      error: new Error("Tournament capacity reached: 40 players registered"),
    }));

    await expect(
      appendTournamentPlayerWithRegistrationNumber({
        extras: extras(),
        player: player({ table: 1 }),
        publicToken: "token",
        redirectTo: "/tma/players",
        supabase: { rpc } as never,
        tournamentId: "tournament-1",
      }),
    ).rejects.toMatchObject({ reason: "evening", registeredPlayersCount: 40 });
  });

  // The database said "Regular registration numbers exhausted" before 19.10.2026, and
  // either wording is the same answer.
  it.each(["Registration numbers exhausted", "Regular registration numbers exhausted"])(
    "passes on the database's refusal: %s",
    async (message) => {
      const rpc = vi.fn(async () => ({ data: null, error: { message } }));

      await expect(
        appendTournamentPlayerWithRegistrationNumber({
          extras: extras(),
          player: player({ table: 1 }),
          publicToken: "token",
          redirectTo: "/tma/players",
          supabase: { rpc } as never,
          tournamentId: "tournament-1",
        }),
      ).rejects.toSatisfy(isRegistrationNumbersExhaustedError);
    },
  );
});
