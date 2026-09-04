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

  // The plate carries the tier, the way the club's cards are printed.
  it("wears the tier on the plate behind the name", () => {
    render(<RatingRow player={player({ tier: "legend" })} />);

    expect(screen.getByRole("link").className).toContain("tier-plate--legend");
  });

  it("crowns a champion", () => {
    render(<RatingRow player={player({ tier: "champion" })} />);

    expect(screen.getByRole("link").className).toContain("tier-plate--champion");
    expect(screen.getByText("👑")).toBeTruthy();
  });

  it("leaves a player without a tier on the plain plate", () => {
    render(<RatingRow player={player()} />);

    expect(screen.getByRole("link").className).not.toContain("tier-plate");
  });

  it("stays on the rating when a row has no nickname to open", () => {
    render(<RatingRow player={player({ name: "" })} />);

    expect(screen.getByRole("link").getAttribute("href")).toBe("/client/rating");
  });
});
