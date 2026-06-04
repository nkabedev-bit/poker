import { describe, expect, it } from "vitest";
import { getFinishTournamentExtrasPatch } from "@/lib/timer/lifecycle";

describe("getFinishTournamentExtrasPatch", () => {
  it("clears the current tournament players", () => {
    expect(getFinishTournamentExtrasPatch()).toEqual({ players: [] });
  });
});
