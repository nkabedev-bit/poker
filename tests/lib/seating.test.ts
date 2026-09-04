import { describe, expect, it } from "vitest";
import {
  buildSeatingTables,
  getSeatPosition,
  isVipTable,
  listFreeSeats,
  pickRandomSeat,
  SEATS_PER_TABLE,
} from "@/lib/tables/seating";

function player(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Ace High",
    seat: 3,
    status: "active" as const,
    table: 1,
    ...overrides,
  };
}

describe("isVipTable", () => {
  it("makes the last table the VIP one", () => {
    expect(isVipTable(3, 3)).toBe(true);
    expect(isVipTable(2, 3)).toBe(false);
  });

  it("leaves a lone table plain", () => {
    expect(isVipTable(1, 1)).toBe(false);
  });
});

describe("buildSeatingTables", () => {
  it("lays out every table with ten seats", () => {
    const tables = buildSeatingTables([], 3);

    expect(tables).toHaveLength(3);
    expect(tables[0].seats).toHaveLength(SEATS_PER_TABLE);
    expect(tables.map((table) => table.isVip)).toEqual([false, false, true]);
  });

  it("puts a player in the seat they hold", () => {
    const [table] = buildSeatingTables([player({ registrationNumber: 7 })], 1);

    expect(table.seats[2].player).toEqual({ id: "p1", name: "Ace High", registrationNumber: 7 });
    expect(table.seats[1].player).toBeNull();
  });

  it("frees the chair of a player who is out", () => {
    const [table] = buildSeatingTables([player({ status: "eliminated" })], 1);

    expect(table.seats[2].player).toBeNull();
  });

  it("ignores a player who was never given a seat", () => {
    const [table] = buildSeatingTables([player({ seat: null })], 1);

    expect(table.seats.every((seat) => seat.player === null)).toBe(true);
  });

  it("survives a broken table count", () => {
    expect(buildSeatingTables([], 0)).toHaveLength(1);
  });
});

describe("getSeatPosition", () => {
  it("starts at the bottom of the table and goes round", () => {
    const first = getSeatPosition(0, 10);

    expect(Math.round(first.left)).toBe(50);
    expect(first.top).toBeGreaterThan(50);
  });

  it("keeps every seat inside the box", () => {
    for (let index = 0; index < 10; index += 1) {
      const { left, top } = getSeatPosition(index, 10);

      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(100);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThanOrEqual(100);
    }
  });
});

describe("picking a seat at random", () => {
  const tables = buildSeatingTables(
    [
      player({ id: "a", seat: 1, table: 1 }),
      player({ id: "b", seat: 2, table: 1 }),
      player({ id: "c", seat: 1, table: 2 }),
    ],
    2,
  );

  it("offers a VIP ticket only the VIP table", () => {
    const free = listFreeSeats(tables, "vip");

    expect(free.every((item) => item.table === 2)).toBe(true);
    expect(free).toHaveLength(9);
  });

  it("keeps a regular ticket off the VIP table", () => {
    const free = listFreeSeats(tables, "regular");

    expect(free.every((item) => item.table === 1)).toBe(true);
    expect(free).toHaveLength(8);
  });

  it("draws one of the free seats", () => {
    const picked = pickRandomSeat(tables, "vip", () => 0);

    expect(picked).toEqual({ seat: 2, table: 2 });
  });

  it("stays inside the list when the draw lands on its very end", () => {
    const picked = pickRandomSeat(tables, "regular", () => 0.999999999);

    expect(picked).toEqual({ seat: 10, table: 1 });
  });

  // Drawing from every free chair at once fills one table first: the emptiest table
  // always offers the fewest chairs, so it is the least likely to come up.
  it("sends the next player to the emptiest table of their kind", () => {
    const room = buildSeatingTables(
      [
        player({ id: "a", seat: 1, table: 1 }),
        player({ id: "b", seat: 2, table: 1 }),
        player({ id: "c", seat: 3, table: 1 }),
        player({ id: "d", seat: 1, table: 2 }),
      ],
      3,
    );

    expect(pickRandomSeat(room, "regular", () => 0)?.table).toBe(2);
    expect(pickRandomSeat(room, "regular", () => 0.99)?.table).toBe(2);
  });

  it("spreads across tables that are equally empty", () => {
    const room = buildSeatingTables([], 3);
    const first = pickRandomSeat(room, "regular", () => 0);
    const second = pickRandomSeat(room, "regular", () => 0.99);

    expect([first?.table, second?.table].sort()).toEqual([1, 2]);
  });

  it("reports nothing when the tables of that kind are full", () => {
    const full = buildSeatingTables(
      Array.from({ length: 10 }, (_, index) =>
        player({ id: `p${index}`, seat: index + 1, table: 2 }),
      ),
      2,
    );

    expect(pickRandomSeat(full, "vip")).toBeNull();
  });

  it("reports nothing when the club opened no VIP table at all", () => {
    expect(pickRandomSeat(buildSeatingTables([], 1), "vip")).toBeNull();
  });
});
