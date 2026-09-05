import { describe, expect, it } from "vitest";
import { mergeMedalCounts, resolveMedalKey } from "@/lib/client/medals";

describe("which medal a tournament is worth", () => {
  it("takes the type the admin picked", () => {
    expect(resolveMedalKey({ tournamentPreset: "phoenix" })).toBe("phoenix");
    expect(resolveMedalKey({ tournamentPreset: "deepstack", isBounty: true })).toBe("deepstack");
  });

  // A tournament set up by hand says what it is through its format and bounty mode.
  it("reads a hand-made tournament off its format", () => {
    expect(resolveMedalKey({ tournamentFormat: "freeroll", tournamentPreset: null })).toBe(
      "freeroll",
    );
  });

  it("reads a bounty tournament off its mode", () => {
    expect(resolveMedalKey({ bountyType: "standard", isBounty: true })).toBe("bounty");
    expect(resolveMedalKey({ bountyType: "mystery", isBounty: true })).toBe("mystery");
    expect(resolveMedalKey({ bountyType: "progressive", isBounty: true })).toBe("progressive");
  });

  // Dealer Revenge and Wanted are not among the club's seven medals.
  it("gives no medal for a tournament that has none", () => {
    expect(resolveMedalKey({ bountyType: "dealer", isBounty: true })).toBeNull();
    expect(resolveMedalKey({ bountyType: "wanted", isBounty: true })).toBeNull();
    expect(resolveMedalKey({ tournamentFormat: "regular", tournamentPreset: null })).toBeNull();
    expect(resolveMedalKey({ bountyType: "standard", isBounty: false })).toBeNull();
  });

  it("refuses a preset it does not recognise", () => {
    expect(resolveMedalKey({ tournamentPreset: "не-турнир" })).toBeNull();
  });
});

describe("what a player holds altogether", () => {
  it("adds the club's own record to what the games say", () => {
    expect(mergeMedalCounts({ phoenix: 3 }, { phoenix: 1, bounty: 2 })).toEqual({
      bounty: 2,
      phoenix: 4,
    });
  });

  it("counts the games alone for a player with no history on file", () => {
    expect(mergeMedalCounts(null, { mystery: 1 })).toEqual({ mystery: 1 });
  });

  it("counts the record alone before a single game is stored", () => {
    expect(mergeMedalCounts({ deepstack: 2 }, {})).toEqual({ deepstack: 2 });
  });

  it("leaves out a medal nobody has", () => {
    expect(mergeMedalCounts({ phoenix: 0 }, { bounty: 0 })).toEqual({});
  });

  // Nothing readable is worth counting, and nothing negative is worth subtracting.
  it("ignores rubbish rather than trusting it", () => {
    expect(mergeMedalCounts({ phoenix: "три", bounty: -2 }, { bounty: 1 })).toEqual({ bounty: 1 });
    expect(mergeMedalCounts({ notamedal: 5 }, {})).toEqual({});
  });
});
