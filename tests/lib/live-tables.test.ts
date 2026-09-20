import { describe, expect, it } from "vitest";
import { buildLiveTables } from "@/lib/tables/live-tables";
import type { TournamentPlayer } from "@/lib/timer/types";

function player(overrides: Partial<TournamentPlayer> & { name: string }): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id: overrides.name,
    rebuys: 0,
    registrationNumber: 1,
    seat: 1,
    stack: 20000,
    status: "active",
    table: 1,
    ...overrides,
  };
}

describe("buildLiveTables", () => {
  it("keeps the knocked-out at the table they went out from", () => {
    const tables = buildLiveTables([
      player({ name: "Играет", registrationNumber: 1, seat: 3 }),
      player({
        finishPlace: 9,
        name: "Выбыл",
        registrationNumber: 2,
        seat: 5,
        status: "eliminated",
      }),
    ]);

    expect(tables).toHaveLength(1);
    expect(tables[0]?.number).toBe(1);
    expect(tables[0]?.activeCount).toBe(1);
    expect(tables[0]?.players.map((item) => item.name)).toEqual(["Играет", "Выбыл"]);
  });

  it("seats those still in first, in seat order, and the busted after them by place", () => {
    const tables = buildLiveTables([
      player({ finishPlace: 4, name: "Вылетел 4-м", registrationNumber: 1, status: "eliminated" }),
      player({ name: "Место 6", registrationNumber: 2, seat: 6 }),
      player({ finishPlace: 2, name: "Вылетел 2-м", registrationNumber: 3, status: "eliminated" }),
      player({ name: "Место 2", registrationNumber: 4, seat: 2 }),
    ]);

    expect(tables[0]?.players.map((item) => item.name)).toEqual([
      "Место 2",
      "Место 6",
      "Вылетел 2-м",
      "Вылетел 4-м",
    ]);
  });

  it("puts the tables in their own order and the unseated last", () => {
    const tables = buildLiveTables([
      player({ name: "Без стола", registrationNumber: 1, seat: null, table: null }),
      player({ name: "Второй стол", registrationNumber: 2, table: 2 }),
      player({ name: "Первый стол", registrationNumber: 3, table: 1 }),
    ]);

    expect(tables.map((table) => table.number)).toEqual([1, 2, null]);
  });

  // A sign-up that never turned into a ticket is nobody anyone in the room can point at.
  it("leaves out a player who never got a registration number", () => {
    const tables = buildLiveTables([
      player({ name: "Не пришёл", registrationNumber: null, seat: null, table: null }),
      player({ name: "Пришёл", registrationNumber: 7 }),
    ]);

    expect(tables).toHaveLength(1);
    expect(tables[0]?.players.map((item) => item.name)).toEqual(["Пришёл"]);
  });

  it("marks the player who is looking and hangs the faces the club has", () => {
    const tables = buildLiveTables(
      [player({ name: "Я", registrationNumber: 1 }), player({ name: "Не я", registrationNumber: 2, seat: 2 })],
      {
        findAvatar: (item) => (item.name === "Я" ? "https://example.test/me.jpg" : null),
        isMe: (item) => item.name === "Я",
      },
    );

    expect(tables[0]?.players[0]).toMatchObject({
      avatarUrl: "https://example.test/me.jpg",
      isMe: true,
    });
    expect(tables[0]?.players[1]).toMatchObject({ avatarUrl: null, isMe: false });
  });

  it("returns nothing for an empty roster", () => {
    expect(buildLiveTables([])).toEqual([]);
  });
});
