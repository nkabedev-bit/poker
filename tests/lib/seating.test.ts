import { describe, expect, it } from "vitest";
import {
  buildSeatingTables,
  countSeats,
  getSeatPosition,
  isSeatAtTable,
  isVipTable,
  listFreeSeats,
  nameSeat,
  nextTableFormat,
  pickRandomSeat,
  pickTableToGrow,
  previousTableFormat,
  readTableFormats,
  SEATS_PER_TABLE,
  seatsOfFormat,
  seatsRemovedBetween,
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

describe("table formats", () => {
  // Short-handed, the chairs are spread round the felt instead of pushed together.
  it("spreads six chairs round the table", () => {
    const [table] = buildSeatingTables([], 1, 6);

    expect(seatsOfFormat(6)).toEqual([1, 2, 4, 6, 7, 9]);
    expect(table.seats.map((seat) => seat.label)).toEqual(["1", "2/3", "4", "6", "7/8", "9"]);
  });

  it("brings the seventh chair to place 5", () => {
    expect(seatsOfFormat(7)).toEqual([1, 2, 4, 5, 6, 7, 9]);
  });

  it("numbers a nine-handed table plainly", () => {
    const [table] = buildSeatingTables([], 1, 9);

    expect(table.seats.map((seat) => seat.label)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("goes up a format at a time", () => {
    expect(nextTableFormat(6)).toBe(7);
    expect(nextTableFormat(7)).toBe(9);
    expect(nextTableFormat(9)).toBe(10);
    expect(nextTableFormat(10)).toBeNull();
  });

  it("takes a count saved before the formats to the next format that holds it", () => {
    expect(nextTableFormat(8)).toBe(9);
  });

  // Chairs go; nobody's place does.
  it("goes down a format only by empty places", () => {
    expect(previousTableFormat(10)).toBe(9);
    expect(previousTableFormat(9)).toBe(7);
    expect(previousTableFormat(7)).toBe(6);
    expect(previousTableFormat(6)).toBeNull();
    expect(seatsRemovedBetween(9, 7)).toEqual([3, 8]);
  });

  // The player at "2/3" keeps place 2: the table growing to nine only renames the chair.
  it("renames the chair between two places once the table grows", () => {
    expect(nameSeat([7, 9], 1, 2)).toBe("2/3");
    expect(nameSeat([7, 9], 2, 2)).toBe("2");
  });

  it("reads each table's own format and falls back to the settings", () => {
    expect(readTableFormats(6, [null, 7], 3)).toEqual([6, 7, 6]);
    expect(readTableFormats(9, "broken", 2)).toEqual([9, 9]);
  });

  it("counts the chairs of every table and knows which places have one", () => {
    const formats = readTableFormats(6, [7], 3);

    expect(countSeats(formats)).toBe(19);
    expect(isSeatAtTable(formats, 1, 5)).toBe(true);
    expect(isSeatAtTable(formats, 2, 5)).toBe(false);
    expect(isSeatAtTable(formats, 4, 1)).toBe(false);
  });
});

describe("buildSeatingTables", () => {
  // The club's tables seat nine, not ten: a plan drawn with a chair that is not in the
  // room sends a player to sit nowhere.
  it("draws the chairs the club actually has", () => {
    const [table] = buildSeatingTables([], 1, 9);

    expect(table.seats).toHaveLength(9);
    expect(table.seats.at(-1)?.seat).toBe(9);
  });

  it("falls back to a full table when nothing says otherwise", () => {
    expect(buildSeatingTables([], 1, 0)[0].seats).toHaveLength(SEATS_PER_TABLE);
    expect(buildSeatingTables([], 1, null)[0].seats).toHaveLength(SEATS_PER_TABLE);
    expect(buildSeatingTables([], 1)[0].seats).toHaveLength(SEATS_PER_TABLE);
  });

  it("keeps a player out of a chair the table no longer has", () => {
    const [table] = buildSeatingTables([player({ seat: 10 })], 1, 9);

    expect(table.seats.some((seat) => seat.player !== null)).toBe(false);
  });

  it("lays out every table with ten seats", () => {
    const tables = buildSeatingTables([], 3);

    expect(tables).toHaveLength(3);
    expect(tables[0].seats).toHaveLength(SEATS_PER_TABLE);
    expect(tables.map((table) => table.isVip)).toEqual([false, false, true]);
  });

  it("draws each table in its own format", () => {
    const tables = buildSeatingTables([], 3, [6, 7, 10]);

    expect(tables.map((table) => table.seats.length)).toEqual([6, 7, 10]);
    expect(tables.map((table) => table.format)).toEqual([6, 7, 10]);
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
  // The dealer has the bottom of the table; seat 1 is just to their left.
  it("leaves the bottom of the table to the dealer", () => {
    const [table] = buildSeatingTables([], 1, 10);

    const first = getSeatPosition(table.seats[0]);

    expect(first.left).toBeLessThan(50);
    expect(first.top).toBeGreaterThan(50);
  });

  it("stands the chair called 2/3 between places 2 and 3", () => {
    const [six] = buildSeatingTables([], 1, 6);
    const [nine] = buildSeatingTables([], 1, 9);

    const between = getSeatPosition(six.seats[1]).top;
    const two = getSeatPosition(nine.seats[1]).top;
    const three = getSeatPosition(nine.seats[2]).top;

    expect(between).toBeLessThan(two);
    expect(between).toBeGreaterThan(three);
  });

  it("keeps every seat inside the box", () => {
    for (const format of [6, 7, 9, 10]) {
      for (const seat of buildSeatingTables([], 1, format)[0].seats) {
        const { left, top } = getSeatPosition(seat);

        expect(left).toBeGreaterThanOrEqual(0);
        expect(left).toBeLessThanOrEqual(100);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(top).toBeLessThanOrEqual(100);
      }
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

  // One player at place 1: places 6 and 7 are the farthest from them round the table.
  it("sits the next player as far as possible from the one already there", () => {
    expect(pickRandomSeat(tables, "vip", () => 0)).toEqual({ seat: 6, table: 2 });
    expect(pickRandomSeat(tables, "vip", () => 0.99)).toEqual({ seat: 7, table: 2 });
  });

  // The evening this was written for: players drawn next to each other at a half-empty
  // nine-seat table while the chairs across the felt stood empty.
  it("fills a half-empty table round the felt instead of in a huddle", () => {
    const room = buildSeatingTables(
      [player({ id: "a", seat: 3, table: 1 }), player({ id: "b", seat: 4, table: 1 })],
      1,
      9,
    );

    expect(pickRandomSeat(room, "regular", () => 0)).toEqual({ seat: 9, table: 1 });
  });

  it("leaves chairs that are equally far to the draw", () => {
    const empty = buildSeatingTables([], 1);

    expect(pickRandomSeat(empty, "regular", () => 0)).toEqual({ seat: 1, table: 1 });
    expect(pickRandomSeat(empty, "regular", () => 0.999999999)).toEqual({ seat: 10, table: 1 });
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

describe("bringing a chair to a full room", () => {
  const seatedAt = (table: number, format: number) =>
    seatsOfFormat(format).map((seat) => player({ id: `t${table}-s${seat}`, seat, table }));

  it("picks the regular table with the fewest players", () => {
    const tables = buildSeatingTables([...seatedAt(1, 7), ...seatedAt(2, 6)], 3, [7, 6, 6]);

    expect(pickTableToGrow(tables, "regular")).toEqual({ format: 7, table: 2 });
  });

  it("brings a VIP chair only to the VIP table", () => {
    const tables = buildSeatingTables([], 3, [6, 6, 9]);

    expect(pickTableToGrow(tables, "vip")).toEqual({ format: 10, table: 3 });
  });

  it("has nowhere to bring one once every table is ten-handed", () => {
    expect(pickTableToGrow(buildSeatingTables([], 2, 10), "regular")).toBeNull();
  });
});
