import { describe, expect, it } from "vitest";
import { buildCardCodes, CARD_BATCH_MAX } from "@/lib/cards/card-batch";

describe("buildCardCodes", () => {
  it("numbers a batch from the prefix the club prints", () => {
    expect(buildCardCodes({ count: 3, prefix: "MJ" })).toEqual(["MJ-01", "MJ-02", "MJ-03"]);
  });

  it("continues an existing run from the given number", () => {
    expect(buildCardCodes({ count: 2, prefix: "MJ", start: 11 })).toEqual(["MJ-11", "MJ-12"]);
  });

  // Padding follows the largest number so a batch stays aligned on the cards.
  it("widens the numbering when the batch runs past 99", () => {
    const codes = buildCardCodes({ count: 2, prefix: "MJ", start: 99 });

    expect(codes).toEqual(["MJ-099", "MJ-100"]);
  });

  it("strips punctuation that has no business in a code", () => {
    expect(buildCardCodes({ count: 1, prefix: " M J/%- " })).toEqual(["MJ--01"]);
  });

  it("falls back to plain numbers without a prefix", () => {
    expect(buildCardCodes({ count: 1, prefix: "" })).toEqual(["01"]);
  });

  it("always builds at least one card", () => {
    expect(buildCardCodes({ count: 0, prefix: "MJ" })).toEqual(["MJ-01"]);
    expect(buildCardCodes({ count: Number.NaN, prefix: "MJ" })).toEqual(["MJ-01"]);
  });

  it("caps an unreasonable batch", () => {
    expect(buildCardCodes({ count: 5000, prefix: "MJ" })).toHaveLength(CARD_BATCH_MAX);
  });
});
