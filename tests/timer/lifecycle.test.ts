import { describe, expect, it } from "vitest";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";

describe("getFinishTournamentExtrasPatch", () => {
  it("clears the current tournament players", () => {
    // The draws belong to the evening that just ended, so they go with the roster.
    // What the desk is left is covered in settling.test.ts.
    expect(getFinishTournamentExtrasPatch()).toMatchObject({
      players: [],
      raffle: null,
      raffleHistory: [],
    });
  });
});
