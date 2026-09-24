import { describe, expect, it } from "vitest";
import {
  formatPlayerNameWithRegistrationNumber,
  getPlayerCategory,
  shouldTakeVipNumber,
  VIP_TABLE_NUMBER,
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
  it("marks the numbers of the VIP range as VIP", () => {
    expect(getPlayerCategory(21)).toBe("VIP");
    expect(getPlayerCategory(25)).toBe("VIP");
    expect(getPlayerCategory(30)).toBe("VIP");
  });

  // VIP runs 21 to 35, and the regular tickets that did not fit into 1–20 take 36 to 40:
  // a regular guest past the twentieth must not be read as VIP for the draw or the sheet.
  it("reads 21 to 35 as VIP and the regular overflow above it as Normal", () => {
    expect(getPlayerCategory(21)).toBe("VIP");
    expect(getPlayerCategory(35)).toBe("VIP");
    expect(getPlayerCategory(36)).toBe("Normal");
    expect(getPlayerCategory(40)).toBe("Normal");
  });

  it("leaves the regular range Normal", () => {
    expect(getPlayerCategory(20)).toBe("Normal");
    expect(getPlayerCategory(1)).toBe("Normal");
    expect(getPlayerCategory(null)).toBe("Normal");
  });
});

describe("shouldTakeVipNumber", () => {
  it("gives the VIP range to a VIP ticket, wherever the player sits", () => {
    expect(shouldTakeVipNumber("vip", 1)).toBe(true);
    expect(shouldTakeVipNumber("vip", VIP_TABLE_NUMBER)).toBe(true);
  });

  it("keeps a regular ticket out of the VIP range, even at the VIP table", () => {
    expect(shouldTakeVipNumber("regular", VIP_TABLE_NUMBER)).toBe(false);
    expect(shouldTakeVipNumber("regular", 2)).toBe(false);
  });

  // A walk-in typed in by hand has no ticket on them, so the table still decides.
  it("falls back to the table for a player without a ticket", () => {
    expect(shouldTakeVipNumber(null, VIP_TABLE_NUMBER)).toBe(true);
    expect(shouldTakeVipNumber(undefined, 1)).toBe(false);
  });
});
