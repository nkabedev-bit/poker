import { describe, expect, it } from "vitest";
import { buildCardSession } from "@/lib/cards/card-code";
import type { TournamentPlayer } from "@/lib/timer/types";

const PRICES = {
  addonPrice: 500,
  buyIn: 1000,
  doubleRebuyPrice: 2000,
  duoBuyIn: 2000,
  rebuyPrice: 1000,
  vipBuyIn: 2000,
};

const player = (over: Partial<TournamentPlayer> = {}): TournamentPlayer => ({
  addons: 0,
  bountyCount: 0,
  finishPlace: null,
  id: "player-1",
  name: "kabedev",
  rebuys: 0,
  seat: 3,
  stack: 10000,
  status: "active",
  table: 1,
  ...over,
});

describe("the card the desk works from", () => {
  // Without cards there is no code to key on, and the player is what the desk points at.
  it("carries the player it belongs to", () => {
    const session = buildCardSession(player(), "", PRICES);

    expect(session.playerId).toBe("player-1");
    expect(session.cardCode).toBe("");
    expect(session.name).toBe("kabedev");
  });

  it("keeps the card code where the club hands them out", () => {
    expect(buildCardSession(player(), "MJ-07", PRICES).cardCode).toBe("MJ-07");
  });

  // A player knocked out an hour ago still owes for their re-entries, and the desk has
  // to catch them before they leave.
  it("says when a player is already out", () => {
    expect(buildCardSession(player({ status: "eliminated" }), "", PRICES).eliminated).toBe(true);
    expect(buildCardSession(player(), "", PRICES).eliminated).toBe(false);
  });

  it("counts re-entries apart from the doubles", () => {
    const session = buildCardSession(player({ doubleRebuys: 1, rebuys: 3 }), "", PRICES);

    expect(session.reentries).toBe(2);
    expect(session.doubleReentries).toBe(1);
  });

  it("says when the entry was covered by a pass", () => {
    expect(buildCardSession(player({ freePass: "vip" }), "", PRICES).freePass).toBe(true);
    expect(buildCardSession(player(), "", PRICES).freePass).toBe(false);
  });

  it("says whether the player has settled", () => {
    expect(buildCardSession(player({ paid: true }), "", PRICES).paid).toBe(true);
    expect(buildCardSession(player(), "", PRICES).paid).toBe(false);
  });
});
