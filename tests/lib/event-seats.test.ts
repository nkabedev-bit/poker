import { describe, expect, it } from "vitest";
import { countFreeSeats, hasFreeSeat, offersVipTicket } from "@/lib/events/seats";

const event = { maxPlayers: 20, maxVipPlayers: 10, vipBuyIn: 2000 };

describe("countFreeSeats", () => {
  it("counts the two allotments apart", () => {
    expect(countFreeSeats(event, { regular: 18, total: 26, vip: 8 })).toEqual({
      regular: 2,
      vip: 2,
    });
  });

  it("keeps the regular seats open when the VIP table is full", () => {
    const seats = countFreeSeats(event, { regular: 5, total: 15, vip: 10 });

    expect(hasFreeSeat(seats, "regular")).toBe(true);
    expect(hasFreeSeat(seats, "vip")).toBe(false);
  });

  it("never reports a negative count when the club oversold a table", () => {
    expect(countFreeSeats(event, { regular: 25, total: 25, vip: 0 }).regular).toBe(0);
  });

  it("treats a poster without a regular limit as never running out", () => {
    const seats = countFreeSeats({ maxPlayers: null, maxVipPlayers: 10 }, undefined);

    expect(seats.regular).toBeNull();
    expect(hasFreeSeat(seats, "regular")).toBe(true);
  });

  // The club has one VIP table of ten, so the VIP count is always a number the player
  // can read — even when the admin left the field empty.
  it("falls back to the VIP table's own ten seats", () => {
    expect(countFreeSeats({ maxPlayers: 20, maxVipPlayers: null }, undefined).vip).toBe(10);
    expect(
      countFreeSeats({ maxPlayers: 20, maxVipPlayers: null }, { regular: 0, total: 4, vip: 4 }).vip,
    ).toBe(6);
  });

  it("closes the VIP seats once that table is full, limit or no limit", () => {
    const seats = countFreeSeats(
      { maxPlayers: 20, maxVipPlayers: null },
      { regular: 0, total: 10, vip: 10 },
    );

    expect(hasFreeSeat(seats, "vip")).toBe(false);
  });
});

describe("offersVipTicket", () => {
  it("offers VIP when the club prices it or opens seats for it", () => {
    expect(offersVipTicket({ maxVipPlayers: null, vipBuyIn: 2000 })).toBe(true);
    expect(offersVipTicket({ maxVipPlayers: 10, vipBuyIn: null })).toBe(true);
  });

  it("offers nothing to choose when the poster has no VIP at all", () => {
    expect(offersVipTicket({ maxVipPlayers: null, vipBuyIn: null })).toBe(false);
  });
});

describe("a tournament without a VIP table", () => {
  it("offers no VIP ticket when the poster opens zero seats", () => {
    expect(offersVipTicket({ maxVipPlayers: 0, vipBuyIn: 2000 })).toBe(false);
  });

  it("counts none free", () => {
    expect(countFreeSeats({ maxPlayers: 20, maxVipPlayers: 0 }, undefined).vip).toBe(0);
  });
});
