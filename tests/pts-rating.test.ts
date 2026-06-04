import { describe, expect, it } from "vitest";
import {
  buildPtsStandingsRows,
  recordPtsElimination,
} from "@/lib/pts-rating";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TournamentPlayer } from "@/lib/timer/types";

function player(
  id: string,
  name: string,
  overrides: Partial<TournamentPlayer> = {},
): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id,
    name,
    rebuys: 0,
    seat: null,
    stack: 10000,
    status: "active",
    table: null,
    ...overrides,
  };
}

describe("PTS rating", () => {
  it("fills default PTS settings with 28 places, bounty points, and split templates", () => {
    const extras = mergeTournamentExtras({});

    expect(extras.pts.placePoints).toHaveLength(28);
    expect(extras.pts.bountyPoints).toBe(0);
    expect(extras.pts.placeTemplates).toEqual([]);
    expect(extras.pts.bountyTemplates).toEqual([]);
  });

  it("normalizes place and bounty templates separately", () => {
    const extras = mergeTournamentExtras({
      pts: {
        bountyTemplates: [{ id: "b1", name: "Bounty 10", bountyPoints: 10 }],
        placeTemplates: [{ id: "p1", name: "Top heavy", placePoints: [300, 200] }],
      },
    });

    expect(extras.pts.placeTemplates[0]).toMatchObject({
      id: "p1",
      name: "Top heavy",
    });
    expect(extras.pts.placeTemplates[0]?.placePoints.slice(0, 3)).toEqual([300, 200, 0]);
    expect(extras.pts.bountyTemplates).toEqual([
      { id: "b1", name: "Bounty 10", bountyPoints: 10 },
    ]);
  });

  it("keeps a re-entry player active, skips finish place, and awards bounty shares", () => {
    const result = recordPtsElimination({
      bountyChipAward: 200,
      eliminatedId: "b",
      isBounty: true,
      killers: [
        { id: "a", name: "A", share: 0.5 },
        { id: "c", name: "C", share: 0.5 },
      ],
      players: [player("a", "A"), player("b", "B"), player("c", "C")],
      usesReentry: true,
    });

    expect(result.finishPlace).toBeNull();
    expect(result.tournamentFinished).toBe(false);
    expect(result.players.find((p) => p.id === "b")).toMatchObject({
      status: "active",
      finishPlace: null,
      rebuys: 1,
    });
    expect(result.players.find((p) => p.id === "a")?.bountyCount).toBe(0.5);
    expect(result.players.find((p) => p.id === "c")?.bountyCount).toBe(0.5);
    expect(result.players.find((p) => p.id === "a")).toMatchObject({
      bountyChipsTotal: 100,
      stack: 10100,
    });
    expect(result.players.find((p) => p.id === "c")).toMatchObject({
      bountyChipsTotal: 100,
      stack: 10100,
    });
  });

  it("assigns second place to final eliminated player, first place to survivor, and finishes tournament", () => {
    const result = recordPtsElimination({
      eliminatedId: "b",
      isBounty: true,
      killers: [{ id: "a", name: "A", share: 1 }],
      players: [player("a", "A"), player("b", "B")],
      usesReentry: false,
    });

    expect(result.finishPlace).toBe(2);
    expect(result.tournamentFinished).toBe(true);
    expect(result.players.find((p) => p.id === "a")).toMatchObject({
      status: "active",
      finishPlace: 1,
      bountyCount: 1,
    });
    expect(result.players.find((p) => p.id === "b")).toMatchObject({
      status: "eliminated",
      finishPlace: 2,
    });
  });

  it("uses the next free finish place when rollback left an occupied active-count place", () => {
    const result = recordPtsElimination({
      eliminatedId: "c",
      isBounty: false,
      killers: [],
      players: [
        player("a", "A", { finishPlace: 10, status: "eliminated" }),
        player("b", "B", { finishPlace: 8, status: "eliminated" }),
        player("c", "C"),
        player("d", "D"),
        player("e", "E"),
        player("f", "F"),
        player("g", "G"),
        player("h", "H"),
        player("i", "I"),
        player("j", "J"),
      ],
      usesReentry: false,
    });

    expect(result.finishPlace).toBe(9);
    expect(result.players.find((p) => p.id === "c")).toMatchObject({
      finishPlace: 9,
      status: "eliminated",
    });
  });

  it("builds standings rows with place points plus bounty points only for known places", () => {
    const rows = buildPtsStandingsRows(
      [
        player("a", "A", { bountyCount: 1.5, finishPlace: 1 }),
        player("b", "B", { finishPlace: 2, status: "eliminated" }),
        player("c", "C", { bountyCount: 2, finishPlace: 3, status: "eliminated" }),
      ],
      {
        bountyPoints: 10,
        placePoints: [300, 200, 100],
      },
    );

    expect(rows).toEqual([
      { bountyCount: 1.5, place: 1, playerName: "A", points: 315 },
      { bountyCount: 0, place: 2, playerName: "B", points: 200 },
      { bountyCount: 2, place: 3, playerName: "C", points: 120 },
    ]);
  });

  it("compacts internal place gaps and keeps bounty count separate from bounty points", () => {
    const rows = buildPtsStandingsRows(
      [
        player("a", "A", { bountyCount: 1, finishPlace: 1 }),
        player("b", "B", { bountyCount: 0.5, finishPlace: 3, status: "eliminated" }),
      ],
      {
        bountyPoints: 30,
        placePoints: [100, 50, 10],
      },
    );

    expect(rows).toEqual([
      { bountyCount: 1, place: 1, playerName: "A", points: 130 },
      { bountyCount: 0.5, place: 2, playerName: "B", points: 65 },
    ]);
  });

  it("splits bounty points by killer count without losing points to early rounding", () => {
    const elimination = recordPtsElimination({
      eliminatedId: "d",
      isBounty: true,
      killers: [
        { id: "a", name: "A", share: 1 / 3 },
        { id: "b", name: "B", share: 1 / 3 },
        { id: "c", name: "C", share: 1 / 3 },
      ],
      players: [player("a", "A"), player("b", "B"), player("c", "C"), player("d", "D")],
      usesReentry: false,
    });

    const rows = buildPtsStandingsRows(
      elimination.players.map((item) => item.id === "a" ? { ...item, finishPlace: 1 } : item),
      {
        bountyPoints: 30,
        placePoints: [0],
      },
    );

    expect(rows[0]).toMatchObject({ bountyCount: 0.33, playerName: "A", points: 10 });
  });
});
