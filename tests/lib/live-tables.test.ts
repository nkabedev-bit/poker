import { describe, expect, it } from "vitest";
import { buildLiveRoom } from "@/lib/tables/live-tables";
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

describe("buildLiveRoom", () => {
  // The question a player asks from their own table is who is still in, and where.
  it("takes the knocked-out off their table and lists them after every table", () => {
    const room = buildLiveRoom([
      player({ name: "Играет", registrationNumber: 1, seat: 3 }),
      player({
        finishPlace: 9,
        name: "Выбыл",
        registrationNumber: 2,
        seat: 5,
        status: "eliminated",
      }),
    ]);

    expect(room.tables).toHaveLength(1);
    expect(room.tables[0]?.number).toBe(1);
    expect(room.tables[0]?.players.map((item) => item.name)).toEqual(["Играет"]);
    expect(room.eliminated.map((item) => item.name)).toEqual(["Выбыл"]);
  });

  // Somebody else may already be sitting in the chair they left.
  it("forgets the seat of a player who is out", () => {
    const room = buildLiveRoom([
      player({ finishPlace: 9, name: "Выбыл", seat: 5, status: "eliminated" }),
    ]);

    expect(room.eliminated[0]).toMatchObject({ seat: null, status: "eliminated" });
  });

  it("seats those still in by seat, and lists the busted the last one out first", () => {
    const room = buildLiveRoom([
      player({ finishPlace: 4, name: "Вылетел 4-м", registrationNumber: 1, status: "eliminated" }),
      player({ name: "Место 6", registrationNumber: 2, seat: 6 }),
      player({ finishPlace: 2, name: "Вылетел 2-м", registrationNumber: 3, status: "eliminated" }),
      player({ name: "Место 2", registrationNumber: 4, seat: 2 }),
      player({ name: "Вылетел, место не записано", registrationNumber: 5, status: "eliminated" }),
    ]);

    expect(room.tables[0]?.players.map((item) => item.name)).toEqual(["Место 2", "Место 6"]);
    expect(room.eliminated.map((item) => item.name)).toEqual([
      "Вылетел 2-м",
      "Вылетел 4-м",
      "Вылетел, место не записано",
    ]);
  });

  it("gathers the knocked-out of every table into one list", () => {
    const room = buildLiveRoom([
      player({ finishPlace: 7, name: "Со второго", registrationNumber: 1, status: "eliminated", table: 2 }),
      player({ name: "Играет на первом", registrationNumber: 2, table: 1 }),
      player({ finishPlace: 8, name: "С первого", registrationNumber: 3, status: "eliminated", table: 1 }),
    ]);

    expect(room.tables.map((table) => table.number)).toEqual([1]);
    expect(room.eliminated.map((item) => item.name)).toEqual(["Со второго", "С первого"]);
  });

  it("puts the tables in their own order and the unseated last", () => {
    const room = buildLiveRoom([
      player({ name: "Без стола", registrationNumber: 1, seat: null, table: null }),
      player({ name: "Второй стол", registrationNumber: 2, table: 2 }),
      player({ name: "Первый стол", registrationNumber: 3, table: 1 }),
    ]);

    expect(room.tables.map((table) => table.number)).toEqual([1, 2, null]);
  });

  // A sign-up that never turned into a ticket is nobody anyone in the room can point at.
  it("leaves out a player who never got a registration number", () => {
    const room = buildLiveRoom([
      player({ name: "Не пришёл", registrationNumber: null, seat: null, table: null }),
      player({ name: "Пришёл", registrationNumber: 7 }),
      player({ name: "Вылетел без номера", registrationNumber: null, status: "eliminated" }),
    ]);

    expect(room.tables).toHaveLength(1);
    expect(room.tables[0]?.players.map((item) => item.name)).toEqual(["Пришёл"]);
    expect(room.eliminated).toEqual([]);
  });

  it("marks the player who is looking and hangs the faces the club has", () => {
    const room = buildLiveRoom(
      [
        player({ name: "Я", registrationNumber: 1 }),
        player({ name: "Не я", registrationNumber: 2, seat: 2 }),
        player({ finishPlace: 5, name: "Я вылетел", registrationNumber: 3, status: "eliminated" }),
      ],
      {
        findAvatar: (item) => (item.name === "Не я" ? null : `https://example.test/${item.id}.jpg`),
        isMe: (item) => item.name.startsWith("Я"),
      },
    );

    expect(room.tables[0]?.players[0]).toMatchObject({
      avatarUrl: "https://example.test/Я.jpg",
      isMe: true,
    });
    expect(room.tables[0]?.players[1]).toMatchObject({ avatarUrl: null, isMe: false });
    expect(room.eliminated[0]).toMatchObject({
      avatarUrl: "https://example.test/Я вылетел.jpg",
      isMe: true,
    });
  });

  it("returns an empty room for an empty roster", () => {
    expect(buildLiveRoom([])).toEqual({ eliminated: [], tables: [] });
  });
});
