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
  it("marks registration numbers 19-27 (table 3) as VIP", () => {
    expect(getPlayerCategory(19)).toBe("VIP");
    expect(getPlayerCategory(23)).toBe("VIP");
    expect(getPlayerCategory(27)).toBe("VIP");
  });

  it("marks numbers outside 19-27 as Normal", () => {
    expect(getPlayerCategory(18)).toBe("Normal");
    expect(getPlayerCategory(28)).toBe("Normal");
    expect(getPlayerCategory(1)).toBe("Normal");
    expect(getPlayerCategory(null)).toBe("Normal");
  });
});
