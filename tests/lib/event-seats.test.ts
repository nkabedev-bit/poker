import { describe, expect, it } from "vitest";
import {
  countAnnouncedSeats,
  countFreeSeats,
  describeAnnouncedSeats,
  formatSeatsCount,
  formatSeatsTaken,
  hasFreeSeat,
  offersDuoTicket,
} from "@/lib/events/seats";

const event = { maxDuoTickets: null, maxPlayers: 20 };

/** A poster like the club's own: 25 regular seats and one "1+1" ticket. */
const withDuo = { duoBuyIn: 2000, maxDuoTickets: 1, maxPlayers: 25 };

describe("countFreeSeats", () => {
  it("counts the two allotments apart", () => {
    expect(countFreeSeats(event, { duo: 0, regular: 18, total: 18 })).toEqual({
      duo: 0,
      regular: 2,
    });
  });

  it("never reports a negative count when the club oversold the room", () => {
    expect(countFreeSeats(event, { duo: 0, regular: 25, total: 25 }).regular).toBe(0);
  });

  it("closes the regular seats once they are taken", () => {
    expect(hasFreeSeat(countFreeSeats(event, { duo: 0, regular: 20, total: 20 }), "regular")).toBe(
      false,
    );
  });

  it("treats a poster without a regular limit as never running out", () => {
    const seats = countFreeSeats({ maxDuoTickets: null, maxPlayers: null }, undefined);

    expect(seats.regular).toBeNull();
    expect(hasFreeSeat(seats, "regular")).toBe(true);
  });
});

describe("the 1+1 ticket", () => {
  it("counts by tickets rather than by seats", () => {
    const seats = countFreeSeats(withDuo, { duo: 1, regular: 4, total: 6 });

    expect(seats.duo).toBe(0);
    expect(hasFreeSeat(seats, "duo")).toBe(false);
    // The pair's two seats came with their own ticket, so the regular ones are untouched.
    expect(seats.regular).toBe(21);
  });

  // The +1 asks for nothing of their own: the ticket that brought them is already spent.
  it("lets the second player in even when everything is sold out", () => {
    const seats = countFreeSeats(withDuo, { duo: 1, regular: 25, total: 27 });

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
    expect(describeAnnouncedSeats({ duoTickets: 1, regular: 25 })).toBe(
      "Всего мест: 27 (25 обычных · 2 по билетам 1+1)",
    );
  });

  it("names only the regular seats when no pair is sold", () => {
    expect(describeAnnouncedSeats({ duoTickets: 0, regular: 24 })).toBe(
      "Всего мест: 24 (24 обычных)",
    );
  });
});

describe("countAnnouncedSeats", () => {
  it("adds up the regular seats and both halves of every 1+1", () => {
    expect(countAnnouncedSeats(withDuo)).toEqual({
      duoTickets: 1,
      regular: 25,
      total: 27,
    });
  });

  it("counts only the regular seats when the poster sells no 1+1", () => {
    expect(
      countAnnouncedSeats({ duoBuyIn: null, maxDuoTickets: null, maxPlayers: 18 }),
    ).toEqual({ duoTickets: 0, regular: 18, total: 18 });
    expect(
      countAnnouncedSeats({ duoBuyIn: 2000, maxDuoTickets: 0, maxPlayers: 18 }),
    ).toEqual({ duoTickets: 0, regular: 18, total: 18 });
  });

  it("names no total when the club announced no regular limit", () => {
    expect(
      countAnnouncedSeats({ duoBuyIn: 2000, maxDuoTickets: 1, maxPlayers: null }),
    ).toBeNull();
  });

  // The count the poster itself was filled in with has to read back the same way to the
  // player, so the breakdown is built from what countAnnouncedSeats worked out.
  it("feeds the announced line the club shows under the tickets", () => {
    const seats = countAnnouncedSeats(withDuo);

    expect(seats && describeAnnouncedSeats(seats)).toBe(
      "Всего мест: 27 (25 обычных · 2 по билетам 1+1)",
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

describe("formatSeatsTaken", () => {
  it("shows how much of the evening is spoken for", () => {
    expect(formatSeatsTaken(20, 27)).toBe("20 из 27");
    expect(formatSeatsTaken(0, 27)).toBe("0 из 27");
    expect(formatSeatsTaken(27, 27)).toBe("27 из 27");
  });

  // The desk can seat a walk-in the poster never counted; the chip stays a number a
  // player can read rather than "30/27".
  it("never counts past the seats the poster announced", () => {
    expect(formatSeatsTaken(30, 27)).toBe("27 из 27");
  });
});
