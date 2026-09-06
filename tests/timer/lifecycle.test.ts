import { describe, expect, it } from "vitest";
import {
  getFinishTournamentExtrasPatch,
  getStartTournamentExtrasPatch,
} from "@/lib/timer/lifecycle";

describe("getFinishTournamentExtrasPatch", () => {
  // The last hand does not end the evening for the desk: half the room has yet to
  // settle up, and clearing the roster took the list of who owes what off the screen.
  it("keeps the roster for the desk to settle up from", () => {
    expect(getFinishTournamentExtrasPatch()).toEqual({
      raffle: null,
      raffleHistory: [],
    });
  });

  it("takes the evening's draws with it", () => {
    const patch = getFinishTournamentExtrasPatch();

    expect(patch.raffle).toBeNull();
    expect(patch.raffleHistory).toEqual([]);
  });
});

describe("getStartTournamentExtrasPatch", () => {
  // Starting a new tournament is the moment a roster stops being the current one.
  it("clears the roster the last evening left behind", () => {
    expect(getStartTournamentExtrasPatch()).toEqual({ players: [] });
  });
});
