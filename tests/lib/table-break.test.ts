import { describe, expect, it } from "vitest";
import {
  describeActiveTable,
  describeTableBreakQuestion,
  describeTableBreakRefusal,
  listActiveTables,
  planTableBreak,
} from "@/lib/tables/table-break";
import type { SeatingPlayer } from "@/lib/tables/seating";

/** A repeatable draw, so a test can say what one particular evening looks like. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A table of `count` players in its first chairs, named after the table. */
function table(number: number, count: number, firstSeat = 1): SeatingPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `t${number}-${index + 1}`,
    name: `Стол ${number} игрок ${index + 1}`,
    seat: firstSeat + index,
    status: "active" as const,
    table: number,
  }));
}

function planOrFail(options: Parameters<typeof planTableBreak>[0]) {
  const plan = planTableBreak(options);
  if (!plan.ok) throw new Error(`Expected a plan, got ${plan.reason}`);
  return plan;
}

function countByTable(moves: { table: number }[]) {
  return moves.reduce<Record<number, number>>((counts, move) => {
    counts[move.table] = (counts[move.table] ?? 0) + 1;
    return counts;
  }, {});
}

describe("planTableBreak", () => {
  it("splits a table evenly between two tables of the same size", () => {
    const plan = planOrFail({
      formats: 9,
      players: [...table(1, 3), ...table(2, 3), ...table(3, 4)],
      random: seeded(1),
      table: 3,
      tablesCount: 3,
    });

    expect(plan.moves).toHaveLength(4);
    expect(countByTable(plan.moves)).toEqual({ 1: 2, 2: 2 });
  });

  // Five and three with four to place come out six and six.
  it("fills the emptier table first, so the room ends up even", () => {
    const plan = planOrFail({
      formats: 9,
      players: [...table(1, 5), ...table(2, 3), ...table(3, 4)],
      random: seeded(2),
      table: 3,
      tablesCount: 3,
    });

    expect(countByTable(plan.moves)).toEqual({ 1: 1, 2: 3 });
  });

  it("gives every player a chair of their own, never one somebody is sitting in", () => {
    const players = [...table(1, 4), ...table(2, 5), ...table(3, 6)];
    const plan = planOrFail({ formats: 9, players, random: seeded(3), table: 3, tablesCount: 3 });

    const taken = new Set(
      players.filter((player) => player.table !== 3).map((player) => `${player.table}:${player.seat}`),
    );
    const chairs = plan.moves.map((move) => `${move.table}:${move.seat}`);

    expect(new Set(chairs).size).toBe(chairs.length);
    expect(chairs.some((chair) => taken.has(chair))).toBe(false);
    expect(plan.moves.every((move) => move.seat >= 1 && move.seat <= 9)).toBe(true);
  });

  it("moves everybody still playing at the table, a player without a chair included", () => {
    const plan = planOrFail({
      formats: 9,
      players: [
        ...table(1, 3),
        ...table(2, 3),
        { id: "seated", name: "С местом", seat: 4, status: "active", table: 3 },
        { id: "waiting", name: "Ждёт места", seat: null, status: "active", table: 3 },
        { id: "out", name: "Вылетел", seat: 5, status: "eliminated", table: 3 },
      ],
      random: seeded(4),
      table: 3,
      tablesCount: 3,
    });

    expect(plan.moves.map((move) => move.playerId).sort()).toEqual(["seated", "waiting"]);
  });

  it("leaves a table nobody plays at out of it", () => {
    const plan = planOrFail({
      formats: 9,
      players: [...table(1, 4), ...table(3, 2)],
      random: seeded(5),
      table: 3,
      tablesCount: 3,
    });

    expect(countByTable(plan.moves)).toEqual({ 1: 2 });
  });

  // Short-handed, a chair between two places goes by both numbers.
  it("calls each chair the way the dealer does", () => {
    const plan = planOrFail({
      formats: [6, 6],
      // Every chair at table 1 taken but the one between places 2 and 3.
      players: [
        { id: "a", name: "A", seat: 1, status: "active", table: 1 },
        { id: "b", name: "B", seat: 4, status: "active", table: 1 },
        { id: "c", name: "C", seat: 6, status: "active", table: 1 },
        { id: "d", name: "D", seat: 7, status: "active", table: 1 },
        { id: "e", name: "E", seat: 9, status: "active", table: 1 },
        { id: "mover", name: "Chura", seat: 1, status: "active", table: 2 },
      ],
      random: seeded(6),
      table: 2,
      tablesCount: 2,
    });

    expect(plan.moves).toEqual([
      { name: "Chura", playerId: "mover", seat: 2, seatLabel: "2/3", table: 1 },
    ]);
  });

  it("lists the moves table by table, seat by seat", () => {
    const plan = planOrFail({
      formats: 9,
      players: [...table(1, 2), ...table(2, 2), ...table(3, 6)],
      random: seeded(7),
      table: 3,
      tablesCount: 3,
    });

    const order = plan.moves.map((move) => move.table * 100 + move.seat);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("is a draw: the same table can come out differently another time", () => {
    const players = [...table(1, 3), ...table(2, 3), ...table(3, 4)];
    const layouts = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        JSON.stringify(
          planOrFail({ formats: 9, players, random: seeded(seed), table: 3, tablesCount: 3 }).moves,
        ),
      ),
    );

    expect(layouts.size).toBeGreaterThan(1);
  });

  it("refuses when the other tables have too few chairs, naming how many", () => {
    const plan = planTableBreak({
      formats: 6,
      // Table 1 full at six, table 2 one short: one chair for three players.
      players: [
        ...[1, 2, 4, 6, 7, 9].map((seat) => ({
          id: `one-${seat}`,
          name: `Один ${seat}`,
          seat,
          status: "active" as const,
          table: 1,
        })),
        ...[1, 2, 4, 6, 7].map((seat) => ({
          id: `two-${seat}`,
          name: `Два ${seat}`,
          seat,
          status: "active" as const,
          table: 2,
        })),
        ...table(3, 3),
      ],
      random: seeded(8),
      table: 3,
      tablesCount: 3,
    });

    expect(plan).toEqual({
      free: 1,
      needed: 3,
      ok: false,
      reason: "not_enough_seats",
      tables: [1, 2],
    });
  });

  it("refuses when nobody else is playing", () => {
    expect(
      planTableBreak({ formats: 9, players: table(2, 4), table: 2, tablesCount: 3 }),
    ).toEqual({ ok: false, reason: "no_other_tables" });
  });

  it("refuses a table nobody is playing at", () => {
    expect(
      planTableBreak({ formats: 9, players: table(1, 4), table: 2, tablesCount: 3 }),
    ).toEqual({ ok: false, reason: "empty_table" });
  });
});

describe("listActiveTables", () => {
  it("counts who is still playing at each table, in the tables' own order", () => {
    expect(
      listActiveTables([
        ...table(3, 2),
        ...table(1, 4),
        { id: "waiting", name: "Ждёт места", seat: null, status: "active", table: 1 },
        { id: "out", name: "Вылетел", seat: 3, status: "eliminated", table: 2 },
        { id: "nowhere", name: "Без стола", seat: null, status: "active", table: null },
      ]),
    ).toEqual([
      { number: 1, players: 5 },
      { number: 3, players: 2 },
    ]);
  });
});

describe("describeTableBreakRefusal", () => {
  it("says how short of chairs the room is, across several tables", () => {
    expect(
      describeTableBreakRefusal(
        { free: 2, needed: 5, ok: false, reason: "not_enough_seats", tables: [1, 2, 4] },
        3,
      ),
    ).toBe(
      "Не хватает мест: за столами 1, 2 и 4 свободно 2 места, а за столом 3 играют 5 игроков. " +
        "Добавьте места (+ место) на экране «Игроки» и попробуйте ещё раз.",
    );
  });

  it("counts a single chair and a single player in the singular", () => {
    expect(
      describeTableBreakRefusal(
        { free: 1, needed: 1, ok: false, reason: "not_enough_seats", tables: [2] },
        1,
      ),
    ).toContain("за столом 2 свободно 1 место, а за столом 1 играет 1 игрок.");
  });

  it("explains a table with nobody at it, and a room with nowhere to go", () => {
    expect(describeTableBreakRefusal({ ok: false, reason: "empty_table" }, 3)).toBe(
      "За столом 3 никто не играет — расформировывать нечего.",
    );
    expect(describeTableBreakRefusal({ ok: false, reason: "no_other_tables" }, 2)).toBe(
      "Кроме стола 2, играющих столов нет — пересаживать некуда.",
    );
  });
});

describe("the desk's choice of table", () => {
  it("names a table with how many are playing at it", () => {
    expect(describeActiveTable({ number: 3, players: 4 })).toBe("Стол 3 · 4 игрока");
    expect(describeActiveTable({ number: 1, players: 1 })).toBe("Стол 1 · 1 игрок");
    expect(describeActiveTable({ number: 2, players: 9 })).toBe("Стол 2 · 9 игроков");
  });

  it("asks before breaking, saying where everybody goes", () => {
    const tables = [
      { number: 1, players: 6 },
      { number: 2, players: 5 },
      { number: 3, players: 4 },
    ];

    expect(describeTableBreakQuestion(tables[2]!, tables)).toBe(
      "Расформировать стол 3? 4 игрока пересядут за столы 1 и 2.",
    );
    expect(
      describeTableBreakQuestion({ number: 2, players: 1 }, [
        { number: 1, players: 7 },
        { number: 2, players: 1 },
      ]),
    ).toBe("Расформировать стол 2? 1 игрок пересядет за стол 1.");
  });
});
