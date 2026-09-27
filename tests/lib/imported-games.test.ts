import { describe, expect, it } from "vitest";
import { hasKnownStartTime, importedGameStart } from "@/lib/results/imported-games";

describe("imported game starts", () => {
  it("stores an imported evening at midday UTC of its day", () => {
    expect(importedGameStart("2026-04-12")).toBe("2026-04-12T12:00:00.000Z");
  });

  it("knows no start time for an imported game, however the database spells it", () => {
    expect(hasKnownStartTime(importedGameStart("2026-04-12"))).toBe(false);
    expect(hasKnownStartTime("2026-04-12T12:00:00+00:00")).toBe(false);
    expect(hasKnownStartTime("2026-04-12T15:00:00+03:00")).toBe(false);
  });

  it("knows the start of a game the app ran", () => {
    expect(hasKnownStartTime("2026-09-26T16:04:31.512+00:00")).toBe(true);
    expect(hasKnownStartTime("2026-09-26T15:10:00.000Z")).toBe(true);
  });

  it("claims nothing for a start it cannot read", () => {
    expect(hasKnownStartTime("not a date")).toBe(false);
  });
});
