import { describe, expect, it } from "vitest";
import {
  getRaffleWeights,
  isRaffle,
  listRaffleEntrants,
  pickRaffleWinner,
  RAFFLE_WIN_MESSAGE,
  toRaffleEvening,
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

    expect(numbers).toEqual([...Array.from({ length: 15 }, (_, index) => index + 1), 21, 22, 23, 24, 25]);
    expect(numbers).not.toContain(16);
  });

  // The free pass is drawn on the whole room: a VIP ticket buys a better seat, not a
  // smaller draw.
  it("draws the free pass on VIP tickets as well as regular ones", () => {
    const numbers = listRaffleEntrants(ROOM, "regular").map((entrant) => entrant.number);

    expect(numbers).toContain(21);
    expect(numbers).toHaveLength(20);
  });

  it("keeps the VIP draw to VIP tickets", () => {
    expect(listRaffleEntrants(ROOM, "vip").map((entrant) => entrant.number)).toEqual([
      21, 22, 23, 24, 25,
    ]);
  });

  // The same guest can take both prizes; that is what the VIP ticket is for.
  it("stands a VIP guest in both draws", () => {
    const inRegular = listRaffleEntrants(ROOM, "regular").some((entrant) => entrant.number === 23);
    const inVip = listRaffleEntrants(ROOM, "vip").some((entrant) => entrant.number === 23);

    expect([inRegular, inVip]).toEqual([true, true]);
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
    const [entrant] = listRaffleEntrants(
      [player(2, { accountId: "account-1", telegramId: 555 })],
      "regular",
    );

    expect(entrant).toEqual({
      accountId: "account-1",
      name: "Игрок 2",
      number: 2,
      telegramId: 555,
    });
  });

  // A player who signed in on the web has no Telegram id, and the account is the only
  // thing their free entry can be credited to.
  it("carries the account of a player who has no Telegram", () => {
    const [entrant] = listRaffleEntrants(
      [player(2, { accountId: "account-web", telegramId: null })],
      "regular",
    );

    expect(entrant).toMatchObject({ accountId: "account-web", telegramId: null });
  });
});

describe("pickRaffleWinner", () => {
  const entrants = listRaffleEntrants(ROOM, "regular");

  it("draws the first entrant at the bottom of the range", () => {
    expect(pickRaffleWinner(entrants, () => 0)?.number).toBe(1);
  });

  it("stays inside the room when the draw lands at the very top", () => {
    expect(pickRaffleWinner(entrants, () => 0.999999999)?.number).toBe(25);
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

describe("what the winner is told", () => {
  it("sends the free pass winner to the app, where it has already landed", () => {
    expect(RAFFLE_WIN_MESSAGE.regular).toContain("проходка");
    expect(RAFFLE_WIN_MESSAGE.regular).toContain("начислена в приложении");
  });

  it("promises the VIP winner a certificate and says nothing about the app", () => {
    expect(RAFFLE_WIN_MESSAGE.vip).toContain("VIP");
    expect(RAFFLE_WIN_MESSAGE.vip).toContain("сертификат");
    expect(RAFFLE_WIN_MESSAGE.vip).not.toContain("приложении");
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

describe("getRaffleWeights", () => {
  const win = (playerName: string, playedOn: string, accountId: string | null = null) => ({
    accountId,
    playedOn,
    playerName,
  });

  it("gives a player who never won the full weight", () => {
    expect(getRaffleWeights([{ accountId: null, name: "Новичок" }], [], "2026-09-16")).toEqual([1]);
  });

  // The club's own example: a win costs four fifths of the weight on the evening of it,
  // and a fifth comes back with every evening the club holds a draw.
  it("brings a winner's weight back over five evenings with a draw", () => {
    const wins = [
      win("Вчерашний", "2026-09-15"),
      win("Позавчерашний", "2026-09-13"),
      win("Третий", "2026-09-12"),
      win("Четвёртый", "2026-09-10"),
      win("Давний", "2026-09-01"),
    ];
    const weights = getRaffleWeights(
      ["Сегодняшний", "Вчерашний", "Позавчерашний", "Третий", "Четвёртый", "Давний"].map((name) => ({
        accountId: null,
        name,
      })),
      [...wins, win("Сегодняшний", "2026-09-16")],
      "2026-09-16",
    );

    expect(weights).toEqual([0.2, 0.4, 0.6, 0.8, 1, 1]);
  });

  it("counts a win in either draw, so tonight's pass winner stands low in the VIP draw", () => {
    expect(getRaffleWeights([{ accountId: null, name: "1$" }], [win("1$", "2026-09-16")], "2026-09-16")).toEqual([0.2]);
  });

  it("recognises a winner by account even after a new nickname", () => {
    const [weight] = getRaffleWeights(
      [{ accountId: "acc-1", name: "Chura" }],
      [win("Mr.Fish", "2026-09-15", "acc-1")],
      "2026-09-16",
    );

    expect(weight).toBe(0.4);
  });

  it("matches a ledger win to a nickname however it is capitalised", () => {
    const [weight] = getRaffleWeights(
      [{ accountId: "acc-2", name: "Киберпсих" }],
      [win("киберпсих", "2026-09-15")],
      "2026-09-16",
    );

    expect(weight).toBe(0.4);
  });

  it("reads the evening on Moscow time", () => {
    expect(toRaffleEvening(new Date("2026-09-15T22:30:00.000Z"))).toBe("2026-09-16");
  });
});

describe("pickRaffleWinner with weights", () => {
  const entrants = [
    { accountId: null, name: "A", number: 1, telegramId: null },
    { accountId: null, name: "B", number: 2, telegramId: null },
  ];

  it("splits the line by weight", () => {
    // Total 1.25: A holds [0, 0.25), B holds [0.25, 1.25).
    expect(pickRaffleWinner(entrants, () => 0.19, [0.25, 1])?.name).toBe("A");
    expect(pickRaffleWinner(entrants, () => 0.21, [0.25, 1])?.name).toBe("B");
    expect(pickRaffleWinner(entrants, () => 0.999999999, [0.25, 1])?.name).toBe("B");
  });

  it("makes a recent winner roughly five times less likely", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const room = Array.from({ length: 20 }, (_, index) => ({
      accountId: null,
      name: `P${index}`,
      number: index + 1,
      telegramId: null,
    }));
    const weights = room.map((_, index) => (index === 0 ? 0.2 : 1));
    let recentWins = 0;
    const draws = 50_000;
    for (let draw = 0; draw < draws; draw += 1) {
      if (pickRaffleWinner(room, random, weights)?.name === "P0") recentWins += 1;
    }

    // 0.2 / 19.2 ≈ 1.04%.
    expect(recentWins / draws).toBeGreaterThan(0.008);
    expect(recentWins / draws).toBeLessThan(0.013);
  });
});
