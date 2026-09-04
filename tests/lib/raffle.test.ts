import { describe, expect, it } from "vitest";
import {
  isRaffle,
  listRaffleEntrants,
  pickRaffleWinner,
  type Raffle,
} from "@/lib/raffle/raffle";

function player(registrationNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    name: `Игрок ${registrationNumber}`,
    registrationNumber,
    telegramId: null,
    ...overrides,
  };
}

// The club's numbers run 1-20 for regular seats and 21-30 for VIP, so a night with
// fifteen regulars and five VIPs has no numbers 16-20 at all.
const ROOM = [
  ...Array.from({ length: 15 }, (_, index) => player(index + 1)),
  ...Array.from({ length: 5 }, (_, index) => player(21 + index)),
];

describe("listRaffleEntrants", () => {
  it("takes only the numbers that exist tonight", () => {
    const numbers = listRaffleEntrants(ROOM, "regular").map((entrant) => entrant.number);

    expect(numbers).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
    expect(numbers).not.toContain(16);
  });

  it("keeps the VIP draw to VIP tickets", () => {
    expect(listRaffleEntrants(ROOM, "vip").map((entrant) => entrant.number)).toEqual([
      21, 22, 23, 24, 25,
    ]);
  });

  // Everyone who came takes part: they paid their entry and are still in the hall.
  it("keeps a player who is already out", () => {
    const entrants = listRaffleEntrants(
      [player(3, { status: "eliminated" }), player(4)],
      "regular",
    );

    expect(entrants.map((entrant) => entrant.number)).toEqual([3, 4]);
  });

  it("skips a player who never got a number", () => {
    expect(listRaffleEntrants([player(0), player(7)], "regular")).toHaveLength(1);
  });

  it("carries the account the prize will go to", () => {
    const [entrant] = listRaffleEntrants([player(2, { telegramId: 555 })], "regular");

    expect(entrant).toEqual({ name: "Игрок 2", number: 2, telegramId: 555 });
  });
});

describe("pickRaffleWinner", () => {
  const entrants = listRaffleEntrants(ROOM, "regular");

  it("draws the first entrant at the bottom of the range", () => {
    expect(pickRaffleWinner(entrants, () => 0)?.number).toBe(1);
  });

  it("stays inside the room when the draw lands at the very top", () => {
    expect(pickRaffleWinner(entrants, () => 0.999999999)?.number).toBe(15);
  });

  it("reaches every entrant across the range", () => {
    const drawn = new Set(
      entrants.map((_, index) => pickRaffleWinner(entrants, () => index / entrants.length)?.number),
    );

    expect(drawn.size).toBe(entrants.length);
  });

  it("draws nobody from an empty room", () => {
    expect(pickRaffleWinner([], Math.random)).toBeNull();
  });
});

describe("a tournament gets one draw of each kind", () => {
  const held = {
    id: "raffle-1",
    kind: "regular" as const,
    numbers: [1, 2, 3],
    prize: "granted" as const,
    spinSeconds: 10,
    startedAt: "2026-09-04T18:00:00.000Z",
    winnerName: "kabedev",
    winnerNumber: 2,
  };

  it("recognises the draw already held", () => {
    const history: Raffle[] = [held];

    expect(isRaffle(held)).toBe(true);
    expect(history.find((item) => item.kind === "regular")).toBeTruthy();
    expect(history.find((item) => item.kind === "vip")).toBeUndefined();
  });

  it("keeps rubbish out of the history", () => {
    expect(isRaffle({ kind: "regular" })).toBe(false);
    expect(isRaffle(null)).toBe(false);
  });
});
