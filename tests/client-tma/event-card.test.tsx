/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventCard, type EventCardData } from "@/app/client/_components/event-card";

afterEach(cleanup);

/** A poster like the club's: 16 regular seats, one "1+1" ticket and a VIP table of 9. */
function event(overrides: Partial<EventCardData> = {}): EventCardData {
  return {
    badge: "Глубина 400BB",
    duoBuyIn: 2000,
    id: "e1",
    maxDuoTickets: 1,
    maxPlayers: 16,
    maxVipPlayers: 9,
    posterUrl: null,
    signedUp: false,
    signupsCount: 20,
    startsAt: "2026-09-08T19:00:00+03:00",
    title: "DEEP STACK",
    vipBuyIn: 3000,
    ...overrides,
  } as EventCardData;
}

describe("EventCard", () => {
  // Scrolling the afisha, a player decides by how full the evening already is — the size
  // of the room on its own tells them nothing.
  it("shows the seats taken out of the seats announced", () => {
    render(<EventCard event={event()} />);

    expect(screen.getByText("20/27 забронировано")).toBeTruthy();
  });

  it("says nothing about seats when the poster names no limit", () => {
    render(<EventCard event={event({ maxPlayers: null })} />);

    expect(screen.queryByText(/забронировано/)).toBeNull();
  });
});
