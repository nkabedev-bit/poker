import { describe, expect, it } from "vitest";
import {
  buildPtsStandingsRows,
  getProgressiveHeadPoints,
  isSideBountyPoints,
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
  it("fills default PTS settings with 30 places, bounty points, and split templates", () => {
    const extras = mergeTournamentExtras({});

    expect(extras.pts.placePoints).toHaveLength(30);
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
      { bountyCount: 1.5, mysteryPoints: null, place: 1, playerName: "A", points: 315 },
      { bountyCount: 0, mysteryPoints: null, place: 2, playerName: "B", points: 200 },
      { bountyCount: 2, mysteryPoints: null, place: 3, playerName: "C", points: 120 },
    ]);
  });

  it("in Mystery mode reports mystery points in their own column and keeps PTS place-only", () => {
    const rows = buildPtsStandingsRows(
      [
        player("a", "A", { bountyCount: 1, finishPlace: 1, mysteryBountyPoints: 150 }),
        player("b", "B", { finishPlace: 2, status: "eliminated" }),
      ],
      {
        bountyPoints: 10,
        bountyType: "mystery",
        placePoints: [300, 200],
      },
    );

    expect(rows).toEqual([
      { bountyCount: 1, mysteryPoints: 150, place: 1, playerName: "A", points: 300 },
      { bountyCount: 0, mysteryPoints: 0, place: 2, playerName: "B", points: 200 },
    ]);
  });

  it("in Dealer Revenge mode reports dealer points in their own column and keeps PTS place-only", () => {
    const rows = buildPtsStandingsRows(
      [
        // Dealer-knockout points live in the shared mysteryBountyPoints field.
        player("a", "A", { bountyCount: 1, finishPlace: 1, mysteryBountyPoints: 60 }),
        player("b", "B", { finishPlace: 2, status: "eliminated" }),
      ],
      {
        bountyPoints: 10,
        bountyType: "dealer",
        placePoints: [300, 200],
      },
    );

    expect(rows).toEqual([
      { bountyCount: 1, mysteryPoints: 60, place: 1, playerName: "A", points: 300 },
      { bountyCount: 0, mysteryPoints: 0, place: 2, playerName: "B", points: 200 },
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
      { bountyCount: 1, mysteryPoints: null, place: 1, playerName: "A", points: 130 },
      { bountyCount: 0.5, mysteryPoints: null, place: 2, playerName: "B", points: 65 },
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

describe("Progressive Bounty", () => {
  it("prices a head at the base plus a step per knockout on the current bullet", () => {
    expect(getProgressiveHeadPoints(0)).toBe(30);
    expect(getProgressiveHeadPoints(1)).toBe(50);
    expect(getProgressiveHeadPoints(3)).toBe(90);
    expect(getProgressiveHeadPoints(undefined)).toBe(30);
  });

  it("prices half a knockout (a split) at half a step", () => {
    expect(getProgressiveHeadPoints(0.5)).toBe(40);
    expect(getProgressiveHeadPoints(1.5)).toBe(60);
  });

  it("keeps its points out of the PTS total, like the other side-bounty modes", () => {
    expect(isSideBountyPoints("progressive")).toBe(true);
  });

  it("raises the killer's head by one step and keeps the total knockout count", () => {
    const result = recordPtsElimination({
      eliminatedId: "b",
      isBounty: true,
      killers: [{ id: "a", name: "A", share: 1 }],
      players: [
        player("a", "A", { bountyCount: 2, progressiveKnockouts: 2 }),
        player("b", "B"),
        player("c", "C"),
      ],
      progressive: true,
      usesReentry: false,
    });

    expect(result.players.find((p) => p.id === "a")).toMatchObject({
      bountyCount: 3,
      progressiveKnockouts: 3,
    });
    expect(getProgressiveHeadPoints(3)).toBe(90);
  });

  it("raises each head by half a step on a split knockout", () => {
    const result = recordPtsElimination({
      eliminatedId: "b",
      isBounty: true,
      killers: [
        { id: "a", name: "A", share: 0.5 },
        { id: "c", name: "C", share: 0.5 },
      ],
      players: [player("a", "A"), player("b", "B"), player("c", "C")],
      progressive: true,
      usesReentry: false,
    });

    expect(result.players.find((p) => p.id === "a")?.progressiveKnockouts).toBe(0.5);
    expect(result.players.find((p) => p.id === "c")?.progressiveKnockouts).toBe(0.5);
    // Half a knockout each is worth half a step on the head price.
    expect(getProgressiveHeadPoints(0.5)).toBe(40);
  });

  it("resets the cycle on a re-entry while the total knockout count stands", () => {
    const result = recordPtsElimination({
      eliminatedId: "hunter",
      isBounty: true,
      killers: [{ id: "a", name: "A", share: 1 }],
      players: [
        player("a", "A"),
        player("hunter", "Hunter", { bountyCount: 3, progressiveKnockouts: 3 }),
        player("c", "C"),
      ],
      progressive: true,
      usesReentry: true,
    });

    expect(result.players.find((p) => p.id === "hunter")).toMatchObject({
      bountyCount: 3,
      progressiveKnockouts: 0,
      rebuys: 1,
      status: "active",
    });
  });
});
