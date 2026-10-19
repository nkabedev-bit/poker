/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventCard, type EventCardData } from "@/app/client/_components/event-card";

afterEach(cleanup);

/** A poster like the club's: 25 regular seats and one "1+1" ticket. */
function event(overrides: Partial<EventCardData> = {}): EventCardData {
  return {
    badge: "Глубина 400BB",
    duoBuyIn: 2000,
    id: "e1",
    maxDuoTickets: 1,
    maxPlayers: 25,
    posterUrl: null,
    signedUp: false,
    signupsCount: 20,
    startsAt: "2026-09-08T19:00:00+03:00",
    title: "DEEP STACK",
    ...overrides,
  } as EventCardData;
}

describe("EventCard", () => {
  // Scrolling the afisha, a player decides by how full the evening already is — the size
  // of the room on its own tells them nothing.
  it("shows the seats taken out of the seats announced", () => {
    render(<EventCard event={event()} />);

    expect(screen.getByText("20 из 27")).toBeTruthy();
  });

  it("says nothing about seats when the poster names no limit", () => {
    render(<EventCard event={event({ maxPlayers: null })} />);

    expect(screen.queryByText(/ из \d/)).toBeNull();
  });

  // The Sochi team is picked by the rating up to 10 November; the poster says so beside
  // its own plate.
  it.each([
    ["the featured poster", true],
    ["a row further down", false],
  ])("marks %s of a game up to 10 November as a Sochi qualifier", (_card, featured) => {
    render(<EventCard event={event({ startsAt: "2026-11-10T19:00:00+03:00" })} featured={featured} />);

    expect(screen.getByText("Отбор в Сочи")).toBeTruthy();
  });

  it("leaves the Sochi plate off a game after 10 November", () => {
    render(<EventCard event={event({ startsAt: "2026-11-11T19:00:00+03:00" })} featured />);

    expect(screen.queryByText("Отбор в Сочи")).toBeNull();
  });
});
