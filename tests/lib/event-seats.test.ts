import { describe, expect, it } from "vitest";
import {
  countAnnouncedSeats,
  countFreeSeats,
  describeAnnouncedSeats,
  formatSeatsCount,
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

describe("countAnnouncedSeats", () => {
  it("adds up the regular seats, the VIP table and both halves of every 1+1", () => {
    expect(countAnnouncedSeats({ ...withDuo, vipBuyIn: 2000 })).toEqual({
      duoTickets: 1,
      regular: 16,
      total: 27,
      vip: 9,
    });
  });

  it("counts the VIP table's own ten seats when the poster leaves the field empty", () => {
    expect(
      countAnnouncedSeats({
        duoBuyIn: null,
        maxDuoTickets: null,
        maxPlayers: 18,
        maxVipPlayers: null,
        vipBuyIn: 2000,
      })?.total,
    ).toBe(28);
  });

  it("counts only the regular seats when the poster sells neither VIP nor 1+1", () => {
    expect(
      countAnnouncedSeats({
        duoBuyIn: null,
        maxDuoTickets: null,
        maxPlayers: 18,
        maxVipPlayers: null,
        vipBuyIn: null,
      }),
    ).toEqual({ duoTickets: 0, regular: 18, total: 18, vip: 0 });
    expect(
      countAnnouncedSeats({
        duoBuyIn: 2000,
        maxDuoTickets: 0,
        maxPlayers: 18,
        maxVipPlayers: 0,
        vipBuyIn: 2000,
      }),
    ).toEqual({ duoTickets: 0, regular: 18, total: 18, vip: 0 });
  });

  it("names no total when the club announced no regular limit", () => {
    expect(
      countAnnouncedSeats({
        duoBuyIn: null,
        maxDuoTickets: null,
        maxPlayers: null,
        maxVipPlayers: 10,
        vipBuyIn: 2000,
      }),
    ).toBeNull();
  });

  // The count the poster itself was filled in with has to read back the same way to the
  // player, so the breakdown is built from what countAnnouncedSeats worked out.
  it("feeds the announced line the club shows under the tickets", () => {
    const seats = countAnnouncedSeats({ ...withDuo, vipBuyIn: 2000 });

    expect(seats && describeAnnouncedSeats(seats)).toBe(
      "Всего мест: 27 (16 обычных · 2 по билетам 1+1 · 9 VIP)",
    );
  });
});

describe("formatSeatsCount", () => {
  it("declines the word by the count", () => {
    expect(formatSeatsCount(1)).toBe("1 место");
    expect(formatSeatsCount(3)).toBe("3 места");
    expect(formatSeatsCount(11)).toBe("11 мест");
    expect(formatSeatsCount(14)).toBe("14 мест");
    expect(formatSeatsCount(21)).toBe("21 место");
    expect(formatSeatsCount(22)).toBe("22 места");
    expect(formatSeatsCount(27)).toBe("27 мест");
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
