import { describe, expect, it } from "vitest";
import {
  formatPlayerNameWithRegistrationNumber,
  getPlayerCategory,
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

describe("VIP player category", () => {
  it("marks registration numbers 21-30 (table 3) as VIP", () => {
    expect(getPlayerCategory(21)).toBe("VIP");
    expect(getPlayerCategory(25)).toBe("VIP");
    expect(getPlayerCategory(30)).toBe("VIP");
  });

  it("marks numbers outside 21-30 as Normal", () => {
    expect(getPlayerCategory(20)).toBe("Normal");
    expect(getPlayerCategory(31)).toBe("Normal");
    expect(getPlayerCategory(1)).toBe("Normal");
    expect(getPlayerCategory(null)).toBe("Normal");
  });
});
