import { describe, expect, it } from "vitest";
import { getFinishTournamentExtrasPatch, getSettlingPlayers } from "@/lib/timer/lifecycle";
import type { TournamentPlayer } from "@/lib/timer/types";

const player = (id: string): TournamentPlayer => ({
  addons: 0,
  bountyCount: 0,
  finishPlace: null,
  id,
  name: id,
  rebuys: 0,
  seat: null,
  stack: 0,
  status: "eliminated",
  table: 1,
});

const FINISHED = new Date("2026-09-06T20:00:00.000Z");

describe("finishing an evening", () => {
  // Sign-ups for the next tournament are seated before its timer is started, so the
  // roster cannot wait: it goes, and the desk is left a copy.
  it("clears the room and leaves the desk a copy", () => {
    const patch = getFinishTournamentExtrasPatch([player("a")], FINISHED);

    expect(patch.players).toEqual([]);
    expect(patch.settling?.players).toHaveLength(1);
    expect(patch.raffle).toBeNull();
  });

  it("gives the copy an hour", () => {
    const patch = getFinishTournamentExtrasPatch([player("a")], FINISHED);

    expect(patch.settling?.closesAt).toBe("2026-09-06T21:00:00.000Z");
  });
});

describe("who the desk is still settling with", () => {
  const settling = { closesAt: "2026-09-06T21:00:00.000Z", players: [player("a")] };

  it("reads the copy while its hour stands", () => {
    const found = getSettlingPlayers(
      { players: [], settling },
      new Date("2026-09-06T20:30:00.000Z"),
    );

    expect(found.map((item) => item.id)).toEqual(["a"]);
  });

  it("lets the copy go once the hour is up", () => {
    expect(
      getSettlingPlayers({ players: [], settling }, new Date("2026-09-06T21:00:01.000Z")),
    ).toEqual([]);
  });

  // The next tournament is being seated: that roster is the one that matters now.
  it("prefers the room in front of it to any copy", () => {
    const found = getSettlingPlayers(
      { players: [player("live")], settling },
      new Date("2026-09-06T20:30:00.000Z"),
    );

    expect(found.map((item) => item.id)).toEqual(["live"]);
  });

  it("reads nothing when there is no copy at all", () => {
    expect(getSettlingPlayers({ players: [] }, FINISHED)).toEqual([]);
  });

  it("refuses a copy whose date is nonsense", () => {
    expect(
      getSettlingPlayers({ players: [], settling: { closesAt: "когда-то", players: [player("a")] } }),
    ).toEqual([]);
  });
});
