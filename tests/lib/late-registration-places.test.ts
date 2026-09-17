import { describe, expect, it } from "vitest";
import { recordPtsElimination } from "@/lib/pts-rating";
import { getTargetedEliminationRollbackPlayers } from "@/lib/tma/elimination-rollback";
import { shiftFinishPlacesForLateRegistration } from "@/lib/tournament-player-registration";
import type { TournamentPlayer } from "@/lib/timer/types";

function player(id: string, over: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id,
    name: id.toUpperCase(),
    rebuys: 0,
    seat: null,
    stack: 10000,
    status: "active",
    table: null,
    ...over,
  };
}

function roster(size: number) {
  return Array.from({ length: size }, (_, index) => player(`p${index + 1}`));
}

/** Один вылет без баунти — только место. */
function bustOut(players: TournamentPlayer[], id: string) {
  return recordPtsElimination({
    eliminatedId: id,
    isBounty: false,
    killers: [],
    players,
    usesReentry: false,
  });
}

function placesByPlayer(players: TournamentPlayer[]) {
  return players
    .filter((item) => Number.isInteger(item.finishPlace))
    .map((item) => [item.id, item.finishPlace] as const)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
}

describe("поздняя регистрация и лестница мест", () => {
  it("сдвигает уже выданные места на шаг вниз", () => {
    const shifted = shiftFinishPlacesForLateRegistration([
      player("a", { finishPlace: 24, status: "eliminated" }),
      player("b", { finishPlace: 17, status: "eliminated" }),
      player("c"),
    ]);

    expect(placesByPlayer(shifted)).toEqual([
      ["b", 18],
      ["a", 25],
    ]);
  });

  it("не трогает ростер, пока никто не вылетел", () => {
    const players = roster(3);

    expect(shiftFinishPlacesForLateRegistration(players)).toBe(players);
  });

  // Первое место выдаётся вместе с концом турнира: дописывать игроков туда уже нечего,
  // и сдвиг отобрал бы у победителя победу.
  it("не трогает законченный турнир", () => {
    const finished = [
      player("winner", { finishPlace: 1 }),
      player("runner-up", { finishPlace: 2, status: "eliminated" }),
    ];

    expect(shiftFinishPlacesForLateRegistration(finished)).toBe(finished);
  });

  // 15.09.2026: 24 игрока, восемь вылетов, опоздавший — и следующая вылетевшая (Vera)
  // получила 25-е место вместо 17-го.
  it("оставляет лестницу целой, когда опоздавший садится посреди турнира", () => {
    let players = roster(24);
    for (let index = 1; index <= 8; index += 1) {
      players = bustOut(players, `p${index}`).players;
    }

    expect(placesByPlayer(players).at(0)).toEqual(["p8", 17]);

    players = [...shiftFinishPlacesForLateRegistration(players), player("late")];

    const vera = bustOut(players, "p9");
    expect(vera.finishPlace).toBe(17);

    players = vera.players;
    for (let index = 10; index <= 24; index += 1) {
      players = bustOut(players, `p${index}`).players;
    }

    const places = placesByPlayer(players).map(([, place]) => place);
    expect(places).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(players.find((item) => item.id === "late")?.finishPlace).toBe(1);
  });

  // Журнал помнит место на момент вылета; после сдвига оно указывает на чужую ступень.
  it("отменяет вылет по месту из ростера, а не из журнала", () => {
    const players = [
      player("p1", { finishPlace: 25, status: "eliminated" }),
      player("p2", { finishPlace: 24, status: "eliminated" }),
      player("p3", { finishPlace: 23, status: "eliminated" }),
      player("late"),
    ];

    const restored = getTargetedEliminationRollbackPlayers(
      { eliminated_id: "p1", finish_place: 24, killers: [] },
      players,
      { shiftLaterFinishPlaces: true },
    );

    expect(placesByPlayer(restored)).toEqual([
      ["p3", 24],
      ["p2", 25],
    ]);
    expect(restored.find((item) => item.id === "p1")).toMatchObject({
      finishPlace: null,
      status: "active",
    });
  });
});
