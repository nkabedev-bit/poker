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

  it("treats a poster without a limit as never running out", () => {
    const seats = countFreeSeats({ maxPlayers: null, maxVipPlayers: null }, undefined);

    expect(seats).toEqual({ regular: null, vip: null });
    expect(hasFreeSeat(seats, "regular")).toBe(true);
    expect(hasFreeSeat(seats, "vip")).toBe(true);
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
