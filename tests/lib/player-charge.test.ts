import { describe, expect, it } from "vitest";
import { buildPlayerCharge } from "@/lib/finance/player-charge";

const prices = {
  addonPrice: 1250,
  buyIn: 1250,
  doubleRebuyPrice: 2000,
  rebuyPrice: 1250,
  vipBuyIn: 2000,
};

function player(overrides: Record<string, unknown> = {}) {
  return { addons: 0, doubleRebuys: 0, rebuys: 0, ticketType: "regular" as const, ...overrides };
}

describe("buildPlayerCharge", () => {
  it("charges the ticket alone for a player who bought nothing else", () => {
    expect(buildPlayerCharge(player(), prices).total).toBe(1250);
  });

  it("prices a double re-entry apart from a single one", () => {
    // Three re-entries, one of them a double: two singles at 1250, one double at 2000.
    const charge = buildPlayerCharge(player({ doubleRebuys: 1, rebuys: 3 }), prices);

    expect(charge.reentries).toEqual({ count: 2, price: 1250, sum: 2500 });
    expect(charge.doubleReentries).toEqual({ count: 1, price: 2000, sum: 2000 });
    expect(charge.total).toBe(1250 + 2500 + 2000);
  });

  it("adds the add-ons a player took", () => {
    expect(buildPlayerCharge(player({ addons: 2 }), prices).total).toBe(1250 + 2500);
  });

  it("charges the VIP price for a VIP ticket", () => {
    expect(buildPlayerCharge(player({ ticketType: "vip" }), prices).ticket.sum).toBe(2000);
  });

  // A pass covers the seat and nothing else.
  it("gives the entry away on a free pass but still charges the re-entries", () => {
    const charge = buildPlayerCharge(
      player({ addons: 1, freePass: "vip", rebuys: 1, ticketType: "vip" }),
      prices,
    );

    expect(charge.ticket).toMatchObject({ free: true, sum: 0 });
    expect(charge.total).toBe(1250 + 1250);
  });

  it("charges no entry at a freeroll", () => {
    const charge = buildPlayerCharge(player(), prices, { freeroll: true });

    expect(charge.ticket).toMatchObject({ free: true, sum: 0 });
    expect(charge.total).toBe(0);
  });

  it("survives a broken counter", () => {
    const charge = buildPlayerCharge(player({ addons: -2, doubleRebuys: 5, rebuys: 1 }), prices);

    expect(charge.addons.count).toBe(0);
    expect(charge.reentries.count).toBe(0);
  });
});
