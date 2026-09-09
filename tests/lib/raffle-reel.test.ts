import { describe, expect, it } from "vitest";
import { buildRaffleReel } from "@/lib/raffle/raffle";

describe("the reel the room watches", () => {
  it("stops on the winner, whichever copy of them it lands on", () => {
    const { landingIndex } = buildRaffleReel(25, 7);

    expect(landingIndex % 25).toBe(7);
  });

  // A winner at the very end would stop with half the screen empty beside them.
  it("leaves reel to the right of the needle", () => {
    const { landingIndex, length } = buildRaffleReel(25, 24);

    expect(length - landingIndex).toBeGreaterThan(25);
  });

  // A VIP draw can be four people, and four cells cross the screen in one blink.
  it("runs a short list more times over", () => {
    const few = buildRaffleReel(4, 0);
    const many = buildRaffleReel(30, 0);

    expect(few.passes).toBeGreaterThan(many.passes);
    expect(few.length).toBeGreaterThanOrEqual(60);
  });

  it("survives a draw with nobody in it", () => {
    expect(() => buildRaffleReel(0, 0)).not.toThrow();
    expect(buildRaffleReel(0, 0).length).toBeGreaterThan(0);
  });
});
