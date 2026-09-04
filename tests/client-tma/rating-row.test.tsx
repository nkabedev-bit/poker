/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RatingRow, type RatingPlayer } from "@/app/client/_components/rating-row";

afterEach(cleanup);

function player(overrides: Partial<RatingPlayer> = {}): RatingPlayer {
  return {
    avatarUrl: null,
    eliminations: 3,
    games: 12,
    isMe: false,
    name: "Maks B",
    place: 4,
    points: 1250,
    tier: null,
    top9: 5,
    ...overrides,
  };
}

describe("RatingRow", () => {
  it("opens that player's profile, whatever spelling the table holds", () => {
    render(<RatingRow player={player({ name: "MAKS B" })} />);

    expect(screen.getByRole("link").getAttribute("href")).toBe("/client/players/maksb");
  });

  // The card art belongs on the board in the hall; a phone list gets the name and a
  // small badge under it.
  it("spells the tier out under the name", () => {
    render(<RatingRow player={player({ tier: "legend" })} />);

    expect(screen.getByText("LEGEND")).toBeTruthy();
  });

  it("crowns a champion", () => {
    render(<RatingRow player={player({ tier: "champion" })} />);

    expect(screen.getByText("CHAMPION")).toBeTruthy();
    expect(screen.getByText("👑")).toBeTruthy();
  });

  it("says nothing under the name of a player without a tier", () => {
    render(<RatingRow player={player()} />);

    expect(screen.queryByText(/member|core|legend|champion/i)).toBeNull();
  });

  it("keeps the nickname white whatever the tier", () => {
    render(<RatingRow player={player({ tier: "legend" })} />);

    expect(screen.getByText("Maks B").getAttribute("style")).toBeNull();
  });

  it("stays on the rating when a row has no nickname to open", () => {
    render(<RatingRow player={player({ name: "" })} />);

    expect(screen.getByRole("link").getAttribute("href")).toBe("/client/rating");
  });
});
