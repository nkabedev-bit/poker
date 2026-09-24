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
  applySeatingTicket,
  buildNumbersExhaustedMessage,
  buildRegistrationFullMessage,
  isRegularRegistrationNumbersExhaustedError,
  isVipRegistrationNumbersExhaustedError,
  reissueRegistrationNumberForTicket,
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

  // The number follows the ticket, and at the door nobody has asked which one yet.
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

describe("seating a walk-in on the ticket they asked for", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveTournamentExtras.mockResolvedValue(undefined);
  });

  it("hands out a regular number for a regular ticket", async () => {
    const numbered = await applySeatingTicket({
      extras: extras({ players: [player({ table: 1 })] }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "regular",
    });

    expect(numbered?.registrationNumber).toBe(1);
  });

  // The club keeps 21 to 35 for VIP tickets, which is the whole reason the number waits
  // for the ticket.
  it("hands out a VIP number for a VIP ticket", async () => {
    const numbered = await applySeatingTicket({
      extras: extras({ players: [player({ table: 1 })] }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    expect(numbered?.registrationNumber).toBe(21);
  });

  it("takes the next number nobody holds", async () => {
    const numbered = await applySeatingTicket({
      extras: extras({
        players: [
          player({ id: "one", registrationNumber: 1 }),
          player({ id: "two", registrationNumber: 2 }),
          player({ table: 1 }),
        ],
      }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "regular",
    });

    expect(numbered?.registrationNumber).toBe(3);
  });

  // A number is what the club calls a player all evening; it does not change under them.
  it("leaves a number already given alone", async () => {
    const numbered = await applySeatingTicket({
      extras: extras({ players: [player({ registrationNumber: 7, table: 1 })] }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    expect(numbered?.registrationNumber).toBe(7);
  });

  // On an evening without cards nothing else records the ticket: the card RPC that used
  // to do it is skipped, and the player was charged for a regular seat.
  it("writes the ticket the desk chose, number or no number", async () => {
    const seated = await applySeatingTicket({
      extras: extras({ players: [player({ registrationNumber: 7, table: 1 })] }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    expect(seated?.ticketType).toBe("vip");
    expect(savedPlayers()[0]).toMatchObject({ registrationNumber: 7, ticketType: "vip" });
  });

  it("writes nothing when the ticket and the number already stand", async () => {
    await applySeatingTicket({
      extras: extras({
        players: [player({ registrationNumber: 7, table: 1, ticketType: "vip" })],
      }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    expect(mocks.saveTournamentExtras).not.toHaveBeenCalled();
  });

  it("does nothing for a player who is not there", async () => {
    await expect(
      applySeatingTicket({
        extras: extras(),
        playerId: "nobody",
        redirectTo: "/tma/players",
        supabase,
        ticketType: "regular",
      }),
    ).resolves.toBeNull();
  });
});

/**
 * The night this was written for: three nine-seat tables. The old code derived the VIP
 * range from tables x seats, so it stopped at 27 and left seven numbers for nine VIP
 * chairs — a guest with a VIP ticket was refused a seat that was standing empty.
 */
describe("VIP numbers on a nine-seat night", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveTournamentExtras.mockResolvedValue(undefined);
  });

  function withVipNumbers(count: number) {
    return Array.from({ length: count }, (_, index) =>
      player({ id: `vip-${index}`, registrationNumber: 21 + index, ticketType: "vip" }),
    );
  }

  it("seats the eighth VIP guest the table arithmetic used to refuse", async () => {
    const numbered = await applySeatingTicket({
      extras: extras({ players: [...withVipNumbers(7), player({ table: 3 })] }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    expect(numbered?.registrationNumber).toBe(28);
  });

  it("goes past 30 rather than running out", async () => {
    const numbered = await applySeatingTicket({
      extras: extras({ players: [...withVipNumbers(10), player({ table: 1 })] }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    expect(numbered?.registrationNumber).toBe(31);
    expect(numbered?.category).toBe("VIP");
  });

  // A player who busted an hour ago is still in the draw and still on the club's sheet,
  // so their number is not free to hand to the next walk-in.
  it("counts a knocked-out player's number as taken", async () => {
    const numbered = await applySeatingTicket({
      extras: extras({
        players: [
          player({ id: "out", registrationNumber: 21, status: "eliminated", ticketType: "vip" }),
          player({ table: 3 }),
        ],
      }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    expect(numbered?.registrationNumber).toBe(22);
  });

  // Busted players keep their numbers, so a long evening runs past 1–20: the next regular
  // ticket goes above the VIP range rather than into it.
  it("gives the twenty-first regular ticket number 36", async () => {
    const crowded = extras({
      players: [
        ...Array.from({ length: 20 }, (_, index) =>
          player({ id: `regular-${index}`, registrationNumber: index + 1, ticketType: "regular" }),
        ),
        player({ table: 1 }),
      ],
    });

    const numbered = await applySeatingTicket({
      extras: crowded,
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "regular",
    });

    expect(numbered?.registrationNumber).toBe(36);
  });

  it("refuses a regular ticket once 1–20 and 36–40 are all out, in words the desk can act on", async () => {
    const full = extras({
      players: [
        ...[...Array.from({ length: 20 }, (_, index) => index + 1), 36, 37, 38, 39, 40].map(
          (number) => player({ id: `regular-${number}`, registrationNumber: number, ticketType: "regular" }),
        ),
        player({ table: 1 }),
      ],
    });

    const refusal = applySeatingTicket({
      extras: full,
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "regular",
    });

    await expect(refusal).rejects.toSatisfy(isRegularRegistrationNumbersExhaustedError);
    expect(buildNumbersExhaustedMessage(await refusal.catch((error) => error))).toBe(
      "Обычные номера 1–20 и 36–40 закончились. Посадите игрока по VIP-билету или освободите номер",
    );
  });

  it("refuses a sixteenth VIP ticket, sending the desk to a regular number", async () => {
    const full = extras({
      players: [
        ...Array.from({ length: 15 }, (_, index) =>
          player({ id: `vip-${index}`, registrationNumber: index + 21, ticketType: "vip" }),
        ),
        player({ table: 1 }),
      ],
    });

    const refusal = applySeatingTicket({
      extras: full,
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    await expect(refusal).rejects.toSatisfy(isVipRegistrationNumbersExhaustedError);
    expect(buildNumbersExhaustedMessage(await refusal.catch((error) => error))).toBe(
      "VIP-номера 21–35 закончились. Посадите игрока по обычному билету или освободите номер",
    );
  });
});

describe("a player who changes tickets mid-evening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveTournamentExtras.mockResolvedValue(undefined);
  });

  /**
   * The re-issue patches one player under the row lock rather than writing the roster
   * back, so the stub answers the way `update_tournament_player` does: the player it was
   * asked for, with the patch merged in.
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

  it("is called by a VIP number once the desk upgrades them", async () => {
    const players = [player({ registrationNumber: 4, table: 3, ticketType: "regular" })];

    const upgraded = await reissueRegistrationNumberForTicket({
      extras: extras({ players }),
      playerId: "walk-in",
      supabase: patchingSupabase(players).supabase,
      ticketType: "vip",
      tournamentId: "tournament-1",
    });

    expect(upgraded).toMatchObject({ registrationNumber: 21, ticketType: "vip" });
    expect(upgraded?.previousRegistrationNumbers).toEqual([4]);
  });

  // The number they were announced by is not handed to somebody else an hour later.
  it("keeps the number they gave back out of circulation", async () => {
    const players = [player({ registrationNumber: 1, table: 3, ticketType: "regular" })];
    const upgraded = await reissueRegistrationNumberForTicket({
      extras: extras({ players }),
      playerId: "walk-in",
      supabase: patchingSupabase(players).supabase,
      ticketType: "vip",
      tournamentId: "tournament-1",
    });

    // Every number of 1–20 but the one just given back is taken, so the next regular
    // ticket moves on to 36 — rather than being handed number 1 a second time.
    const crowded = extras({
      players: [
        upgraded!,
        ...Array.from({ length: 19 }, (_, index) =>
          player({ id: `regular-${index}`, registrationNumber: index + 2 }),
        ),
        player({ id: "next", table: 1 }),
      ],
    });

    const next = await applySeatingTicket({
      extras: crowded,
      playerId: "next",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "regular",
    });

    expect(next?.registrationNumber).toBe(36);
  });

  // Sitting a VIP guest at a regular table is not a change of ticket, and their number
  // is what the room has been calling them all evening.
  it("leaves a number alone when the ticket already matches it", async () => {
    const players = [player({ registrationNumber: 24, table: 1, ticketType: "vip" })];
    const { rpc, supabase: stub } = patchingSupabase(players);

    const same = await reissueRegistrationNumberForTicket({
      extras: extras({ players }),
      playerId: "walk-in",
      supabase: stub,
      ticketType: "vip",
      tournamentId: "tournament-1",
    });

    expect(same?.registrationNumber).toBe(24);
    expect(rpc).not.toHaveBeenCalled();
  });

  // A walk-in seated from their player card has no number at all yet: this is what puts
  // them in the draw.
  it("gives a numberless walk-in the number their ticket names", async () => {
    const players = [player({ registrationNumber: null, table: 1 })];

    const numbered = await reissueRegistrationNumberForTicket({
      extras: extras({ players }),
      playerId: "walk-in",
      supabase: patchingSupabase(players).supabase,
      ticketType: "vip",
      tournamentId: "tournament-1",
    });

    expect(numbered?.registrationNumber).toBe(21);
    expect(numbered?.previousRegistrationNumbers).toEqual([]);
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

  it("passes on the database's refusal of a sixteenth VIP ticket", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "VIP registration numbers exhausted" },
    }));

    await expect(
      appendTournamentPlayerWithRegistrationNumber({
        extras: extras(),
        player: player({ table: 1, ticketType: "vip" }),
        publicToken: "token",
        redirectTo: "/tma/players",
        supabase: { rpc } as never,
        tournamentId: "tournament-1",
      }),
    ).rejects.toSatisfy(isVipRegistrationNumbersExhaustedError);
  });
});
