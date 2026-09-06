import { describe, expect, it } from "vitest";
import { isReservableTicket } from "@/lib/events/types";
import { reservedTicketMessage } from "@/lib/events/reservations";

describe("the tickets the club can hold", () => {
  it("takes the three it sells", () => {
    expect(isReservableTicket("regular")).toBe(true);
    expect(isReservableTicket("vip")).toBe(true);
    expect(isReservableTicket("duo")).toBe(true);
  });

  // The +1's half is given out by accepting an invitation, never held for anybody.
  it("refuses anything else", () => {
    expect(isReservableTicket("duo_plus_one")).toBe(false);
    expect(isReservableTicket("")).toBe(false);
    expect(isReservableTicket(null)).toBe(false);
  });
});

describe("what the club tells a player whose ticket is waiting", () => {
  it("names the tournament and the kind of seat", () => {
    expect(reservedTicketMessage("ЧЕТВЕРГОВЫЙ", "vip")).toContain("VIP");
    expect(reservedTicketMessage("ЧЕТВЕРГОВЫЙ", "regular")).toContain("обычный");
    expect(reservedTicketMessage("ЧЕТВЕРГОВЫЙ", "regular")).toContain("ЧЕТВЕРГОВЫЙ");
  });

  // A pair is promised to one player, and the second half is theirs to fill — so the
  // message asks for a name rather than just a yes.
  it("asks a held pair for the second name", () => {
    const message = reservedTicketMessage("ЧЕТВЕРГОВЫЙ", "duo");

    expect(message).toContain("1+1");
    expect(message).toContain("напарник");
    expect(message).not.toContain("обычный");
  });
});
