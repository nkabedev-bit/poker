import { describe, expect, it } from "vitest";
import {
  countFreeSeats,
  describeAnnouncedSeats,
  hasFreeSeat,
  offersDuoTicket,
  offersVipTicket,
} from "@/lib/events/seats";

const event = { maxDuoTickets: null, maxPlayers: 20, maxVipPlayers: 10, vipBuyIn: 2000 };

/** A poster like the club's own: 16 regular seats, one "1+1" ticket and the VIP table. */
const withDuo = { duoBuyIn: 2000, maxDuoTickets: 1, maxPlayers: 16, maxVipPlayers: 9 };

describe("countFreeSeats", () => {
  it("counts the three allotments apart", () => {
    expect(countFreeSeats(event, { duo: 0, regular: 18, total: 26, vip: 8 })).toEqual({
      duo: 0,
      regular: 2,
      vip: 2,
    });
  });

  it("keeps the regular seats open when the VIP table is full", () => {
    const seats = countFreeSeats(event, { duo: 0, regular: 5, total: 15, vip: 10 });

    expect(hasFreeSeat(seats, "regular")).toBe(true);
    expect(hasFreeSeat(seats, "vip")).toBe(false);
  });

  it("never reports a negative count when the club oversold a table", () => {
    expect(countFreeSeats(event, { duo: 0, regular: 25, total: 25, vip: 0 }).regular).toBe(0);
  });

  it("treats a poster without a regular limit as never running out", () => {
    const seats = countFreeSeats({ maxDuoTickets: null, maxPlayers: null, maxVipPlayers: 10 }, undefined);

    expect(seats.regular).toBeNull();
    expect(hasFreeSeat(seats, "regular")).toBe(true);
  });

  // The club has one VIP table of ten, so the VIP count is always a number the player
  // can read — even when the admin left the field empty.
  it("falls back to the VIP table's own ten seats", () => {
    expect(countFreeSeats({ maxDuoTickets: null, maxPlayers: 20, maxVipPlayers: null }, undefined).vip).toBe(10);
    expect(
      countFreeSeats({ maxDuoTickets: null, maxPlayers: 20, maxVipPlayers: null }, { duo: 0, regular: 0, total: 4, vip: 4 }).vip,
    ).toBe(6);
  });

  it("closes the VIP seats once that table is full, limit or no limit", () => {
    const seats = countFreeSeats(
      { maxDuoTickets: null, maxPlayers: 20, maxVipPlayers: null },
      { duo: 0, regular: 0, total: 10, vip: 10 },
    );

    expect(hasFreeSeat(seats, "vip")).toBe(false);
  });
});

describe("the 1+1 ticket", () => {
  it("counts by tickets rather than by seats", () => {
    const seats = countFreeSeats(withDuo, { duo: 1, regular: 4, total: 6, vip: 0 });

    expect(seats.duo).toBe(0);
    expect(hasFreeSeat(seats, "duo")).toBe(false);
    // The pair's two seats came with their own ticket, so the regular ones are untouched.
    expect(seats.regular).toBe(12);
  });

  // The +1 asks for nothing of their own: the ticket that brought them is already spent.
  it("lets the second player in even when everything is sold out", () => {
    const seats = countFreeSeats(withDuo, { duo: 1, regular: 16, total: 27, vip: 9 });

    expect(hasFreeSeat(seats, "regular")).toBe(false);
    expect(hasFreeSeat(seats, "duo")).toBe(false);
    expect(hasFreeSeat(seats, "duo_plus_one")).toBe(true);
  });

  it("is sold only when the poster names both a price and a count", () => {
    expect(offersDuoTicket(withDuo)).toBe(true);
    expect(offersDuoTicket({ duoBuyIn: 2000, maxDuoTickets: 0 })).toBe(false);
    expect(offersDuoTicket({ duoBuyIn: null, maxDuoTickets: 1 })).toBe(false);
    expect(offersDuoTicket({ duoBuyIn: 2000, maxDuoTickets: null })).toBe(false);
  });

  it("spells out how many players the poster lets in altogether", () => {
    expect(describeAnnouncedSeats({ duoTickets: 1, regular: 16, vip: 9 })).toBe(
      "Всего мест: 27 (16 обычных · 2 по билетам 1+1 · 9 VIP)",
    );
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
    expect(
      countFreeSeats({ maxDuoTickets: null, maxPlayers: 20, maxVipPlayers: 0 }, undefined).vip,
    ).toBe(0);
  });
});
