import { describe, expect, it } from "vitest";
import { getPublicAverageStack, getPublicChipBankTotal } from "@/components/public/public-screen";
import type { TournamentPlayer } from "@/lib/timer/types";

function player(overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    addons: 0,
    bountyChipsTotal: 0,
    bountyCount: 0,
    finishPlace: null,
    id: crypto.randomUUID(),
    name: "Player",
    rebuys: 0,
    seat: null,
    stack: 10000,
    status: "active",
    table: 1,
    ...overrides,
  };
}

function state(players: TournamentPlayer[], settings: Record<string, unknown> = {}) {
  return {
    extras: {
      players,
      settings: { addonChips: 15000, tablesCount: 1, ...settings },
    },
    tournament: { startingStack: 10000 },
  } as never;
}

describe("getPublicAverageStack", () => {
  it("shares every chip in play between the players still in", () => {
    expect(getPublicAverageStack(90000, 9)).toBe(10000);
  });

  it("rounds to whole chips", () => {
    expect(getPublicAverageStack(100000, 3)).toBe(33333);
  });

  it("reports nothing when the tournament is over", () => {
    expect(getPublicAverageStack(90000, 0)).toBe(0);
  });
});

// The bank is what the average divides, so what it counts decides whether the average
// is right in every format the club runs.
describe("the bank behind the average", () => {
  it("counts a re-entry as another starting stack", () => {
    const chips = getPublicChipBankTotal(state([player({ rebuys: 1 }), player()]));

    expect(chips).toBe(30000);
  });

  it("counts a double re-entry as two starting stacks", () => {
    const chips = getPublicChipBankTotal(state([player({ doubleRebuys: 1, rebuys: 1 })]));

    expect(chips).toBe(30000);
  });

  it("counts the chips an add-on brought in", () => {
    const chips = getPublicChipBankTotal(state([player({ addons: 1, addonChipsTotal: 15000 })]));

    expect(chips).toBe(25000);
  });

  it("counts the big blinds paid out for a knockout", () => {
    const chips = getPublicChipBankTotal(state([player({ bountyChipsTotal: 1600 }), player()]));

    expect(chips).toBe(21600);
  });

  // A knocked-out player's chips did not leave the room — they moved to whoever took
  // them, so the bank keeps counting the seat they arrived with.
  it("keeps the chips of a player who is out", () => {
    const chips = getPublicChipBankTotal(state([player({ status: "eliminated" }), player()]));

    expect(chips).toBe(20000);
    expect(getPublicAverageStack(chips, 1)).toBe(20000);
  });
});
