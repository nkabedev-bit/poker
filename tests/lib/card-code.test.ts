import { describe, expect, it } from "vitest";
import { buildCardSession, isTicketType, normalizeCardCode } from "@/lib/cards/card-code";
import type { TournamentPlayer } from "@/lib/timer/types";

function player(overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id: "player-1",
    name: "Ace High",
    rebuys: 0,
    seat: null,
    stack: 1000,
    status: "active",
    table: 1,
    ...overrides,
  };
}

describe("normalizeCardCode", () => {
  it("trims what the scanner returned", () => {
    expect(normalizeCardCode("  MJ-014 \n")).toBe("MJ-014");
  });

  it("caps an absurdly long payload", () => {
    expect(normalizeCardCode("x".repeat(200))).toHaveLength(64);
  });

  it("treats a missing code as empty", () => {
    expect(normalizeCardCode(null)).toBe("");
    expect(normalizeCardCode(undefined)).toBe("");
  });
});

describe("isTicketType", () => {
  it("accepts only the two tickets the club sells", () => {
    expect(isTicketType("regular")).toBe(true);
    expect(isTicketType("vip")).toBe(true);
    expect(isTicketType("free")).toBe(false);
  });
});

describe("buildCardSession", () => {
  // `rebuys` counts doubles too, and the desk needs them apart.
  it("reports single and double re-entries separately", () => {
    const session = buildCardSession(player({ doubleRebuys: 1, rebuys: 3 }), "MJ-014");

    expect(session.reentries).toBe(2);
    expect(session.doubleReentries).toBe(1);
  });

  it("shows the ticket the player was handed", () => {
    expect(buildCardSession(player({ ticketType: "vip" }), "MJ-014").ticketType).toBe("vip");
  });

  it("falls back to a regular ticket when none was recorded", () => {
    expect(buildCardSession(player(), "MJ-014").ticketType).toBe("regular");
  });

  it("carries the identity the admin needs at the desk", () => {
    const session = buildCardSession(
      player({ addons: 2, registrationNumber: 21, table: 3 }),
      "MJ-014",
    );

    expect(session).toMatchObject({
      addons: 2,
      cardCode: "MJ-014",
      name: "Ace High",
      registrationNumber: 21,
      table: 3,
    });
  });

  it("marks a ticket paid with a free pass so the desk takes nothing for it", () => {
    expect(buildCardSession(player({ freePass: "vip" }), "MJ-014").freePass).toBe(true);
    expect(buildCardSession(player(), "MJ-014").freePass).toBe(false);
    expect(buildCardSession(player({ freePass: null }), "MJ-014").freePass).toBe(false);
  });

  it("never reports negative counters from a broken record", () => {
    const session = buildCardSession(player({ addons: -3, doubleRebuys: 5, rebuys: 1 }), "MJ-014");

    expect(session.addons).toBe(0);
    expect(session.reentries).toBe(0);
  });
});
