import { describe, expect, it } from "vitest";
import {
  formatPlayerNameWithRegistrationNumber,
  hasRegistrationNumber,
  REGISTRATION_NUMBERS_PER_EVENING,
} from "@/lib/player-registration-number";

describe("player registration number formatting", () => {
  it("prefixes a player name with a positive registration number", () => {
    expect(formatPlayerNameWithRegistrationNumber({ name: "Ace High", registrationNumber: 17 })).toBe(
      "#17 Ace High",
    );
  });

  it("keeps the plain name when registration number is absent", () => {
    expect(formatPlayerNameWithRegistrationNumber({ name: "Ace High", registrationNumber: null })).toBe(
      "Ace High",
    );
  });
});

describe("the evening's numbers", () => {
  it("holds forty players at most", () => {
    expect(REGISTRATION_NUMBERS_PER_EVENING).toBe(40);
  });

  it("tells a player who was called by a number from one who was not", () => {
    expect(hasRegistrationNumber({ name: "Ace High", registrationNumber: 1 })).toBe(true);
    expect(hasRegistrationNumber({ name: "Ace High", registrationNumber: null })).toBe(false);
    expect(hasRegistrationNumber({ name: "Ace High", registrationNumber: 0 })).toBe(false);
  });
});
