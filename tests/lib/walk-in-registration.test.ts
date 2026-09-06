import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

const mocks = vi.hoisted(() => ({ saveTournamentExtras: vi.fn() }));

vi.mock("@/lib/tournament-extras", () => ({
  saveTournamentExtras: mocks.saveTournamentExtras,
}));

const { appendUnseatedTournamentPlayer, issueRegistrationNumberIfMissing } = await import(
  "@/lib/tournament-player-registration"
);

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
      players: [player({ id: "already-here" })],
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
});

describe("giving a walk-in their number", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveTournamentExtras.mockResolvedValue(undefined);
  });

  it("hands out a regular number for a regular ticket", async () => {
    const numbered = await issueRegistrationNumberIfMissing({
      extras: extras({ players: [player({ table: 1 })] }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "regular",
    });

    expect(numbered?.registrationNumber).toBe(1);
  });

  // The club keeps 21 to 30 for the VIP table, which is the whole reason the number
  // waits for the ticket.
  it("hands out a VIP number for a VIP ticket", async () => {
    const numbered = await issueRegistrationNumberIfMissing({
      extras: extras({ players: [player({ table: 1 })] }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    expect(numbered?.registrationNumber).toBe(21);
  });

  it("takes the next number nobody holds", async () => {
    const numbered = await issueRegistrationNumberIfMissing({
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
    const numbered = await issueRegistrationNumberIfMissing({
      extras: extras({ players: [player({ registrationNumber: 7, table: 1 })] }),
      playerId: "walk-in",
      redirectTo: "/tma/players",
      supabase,
      ticketType: "vip",
    });

    expect(numbered?.registrationNumber).toBe(7);
    expect(mocks.saveTournamentExtras).not.toHaveBeenCalled();
  });

  it("does nothing for a player who is not there", async () => {
    await expect(
      issueRegistrationNumberIfMissing({
        extras: extras(),
        playerId: "nobody",
        redirectTo: "/tma/players",
        supabase,
        ticketType: "regular",
      }),
    ).resolves.toBeNull();
  });
});
