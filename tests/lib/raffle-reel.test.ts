import { describe, expect, it } from "vitest";
import { buildRaffleReel } from "@/lib/raffle/raffle";

describe("the reel the room watches", () => {
  /** The face the cell at `index` shows, the way the screen builds the reel. */
  const faceUnder = (faces: number, winnerIndex: number) => {
    const reel = buildRaffleReel(faces, winnerIndex);
    return (reel.landingIndex + reel.startOffset) % faces;
  };

  it("stops on the winner, whoever they are", () => {
    expect(faceUnder(25, 7)).toBe(7);
    expect(faceUnder(4, 3)).toBe(3);
    expect(faceUnder(30, 0)).toBe(0);
    expect(faceUnder(30, 29)).toBe(29);
  });

  // A winner at the very end would stop with half the screen bare beside them.
  it("leaves reel to the right of the needle", () => {
    const { landingIndex, length } = buildRaffleReel(25, 24);

    expect(length - landingIndex).toBeGreaterThanOrEqual(10);
  });

  // Every cell is one the laptop driving the television has to draw, so the reel is the
  // same length for a full house, a quiet Tuesday, and whoever happens to win.
  it("is the same length whatever the draw", () => {
    const lengths = [
      buildRaffleReel(30, 0).length,
      buildRaffleReel(30, 29).length,
      buildRaffleReel(4, 1).length,
      buildRaffleReel(1, 0).length,
    ];

    expect(new Set(lengths).size).toBe(1);
    expect(lengths[0]).toBeLessThan(70);
  });

  // A VIP draw can be four people, and four cells would cross the screen in one blink.
  it("brings a short list round more often", () => {
    expect(buildRaffleReel(4, 0).passes).toBeGreaterThan(buildRaffleReel(30, 0).passes);
  });

  it("survives a draw with nobody in it", () => {
    expect(() => buildRaffleReel(0, 0)).not.toThrow();
    expect(buildRaffleReel(0, 0).length).toBeGreaterThan(0);
  });
});
