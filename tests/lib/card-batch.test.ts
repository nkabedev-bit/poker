import { describe, expect, it } from "vitest";
import {
  buildCardCodes,
  CARD_BATCH_MAX,
  nextStartNumber,
  normalizeCardPrefix,
  type CardBatch,
} from "@/lib/cards/card-batch";

describe("buildCardCodes", () => {
  it("numbers a batch from the prefix the club prints", () => {
    expect(buildCardCodes({ count: 3, prefix: "MJ" })).toEqual(["MJ-001", "MJ-002", "MJ-003"]);
  });

  it("continues an existing run from the given number", () => {
    expect(buildCardCodes({ count: 2, prefix: "MJ", start: 11 })).toEqual(["MJ-011", "MJ-012"]);
  });

  // The width used to follow the size of the run, so the same card came out MJ-01 in a
  // batch of ten and MJ-001 in a batch of a hundred. Three digits always, and the desk
  // types back exactly what is printed.
  it("numbers every batch to the same width", () => {
    expect(buildCardCodes({ count: 10, prefix: "MJ" })).toEqual(
      buildCardCodes({ count: 100, prefix: "MJ" }).slice(0, 10),
    );
  });

  it("keeps a run past 999 whole rather than losing a digit", () => {
    const codes = buildCardCodes({ count: 2, prefix: "MJ", start: 999 });

    expect(codes).toEqual(["MJ-0999", "MJ-1000"]);
  });

  it("strips punctuation that has no business in a code", () => {
    expect(buildCardCodes({ count: 1, prefix: " M J/%- " })).toEqual(["MJ--001"]);
  });

  it("falls back to plain numbers without a prefix", () => {
    expect(buildCardCodes({ count: 1, prefix: "" })).toEqual(["001"]);
  });

  it("always builds at least one card", () => {
    expect(buildCardCodes({ count: 0, prefix: "MJ" })).toEqual(["MJ-001"]);
    expect(buildCardCodes({ count: Number.NaN, prefix: "MJ" })).toEqual(["MJ-001"]);
  });

  it("caps an unreasonable batch", () => {
    expect(buildCardCodes({ count: 5000, prefix: "MJ" })).toHaveLength(CARD_BATCH_MAX);
  });
});

function batch(overrides: Partial<CardBatch> = {}): CardBatch {
  return {
    count: 10,
    createdAt: "2026-09-07T10:00:00.000Z",
    id: "batch-1",
    prefix: "MJ",
    startNumber: 1,
    ...overrides,
  };
}

describe("normalizeCardPrefix", () => {
  it("spells a pack one way, whatever the admin typed", () => {
    expect(normalizeCardPrefix(" mj ")).toBe("MJ");
    expect(normalizeCardPrefix("g")).toBe("G");
  });
});

describe("nextStartNumber", () => {
  it("starts a pack nobody has printed at one", () => {
    expect(nextStartNumber([], "MJ")).toBe(1);
  });

  it("carries on past the highest number printed", () => {
    expect(nextStartNumber([batch({ count: 10, startNumber: 1 })], "MJ")).toBe(11);
  });

  // The guest cards run on their own numbering: a hundred club cards must not push G-001
  // out of reach.
  it("counts the packs apart", () => {
    const printed = [batch({ count: 100, startNumber: 1 }), batch({ id: "b2", prefix: "G", count: 5 })];

    expect(nextStartNumber(printed, "MJ")).toBe(101);
    expect(nextStartNumber(printed, "G")).toBe(6);
  });

  it("reads a pack typed in a hurry as the same pack", () => {
    expect(nextStartNumber([batch({ prefix: "mj" })], "MJ")).toBe(11);
  });

  it("takes the furthest run, not the last one added", () => {
    const printed = [batch({ count: 50, startNumber: 1 }), batch({ id: "b2", count: 5, startNumber: 200 })];

    expect(nextStartNumber(printed, "MJ")).toBe(205);
  });
});
