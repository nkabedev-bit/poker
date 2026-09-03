import { describe, expect, it } from "vitest";
import {
  buildSeatingTables,
  getSeatPosition,
  isVipTable,
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
