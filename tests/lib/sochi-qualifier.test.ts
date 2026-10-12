import { describe, expect, it } from "vitest";
import { isSochiQualifier } from "@/lib/events/sochi-qualifier";

describe("isSochiQualifier", () => {
  it("counts every game up to and including 10 November", () => {
    expect(isSochiQualifier("2026-10-13T19:00:00+03:00")).toBe(true);
    expect(isSochiQualifier("2026-11-10T19:00:00+03:00")).toBe(true);
    expect(isSochiQualifier("2026-11-10T23:59:00+03:00")).toBe(true);
  });

  // The day is Moscow's, whatever zone the database writes the start in.
  it("leaves out games from 11 November Moscow time", () => {
    expect(isSochiQualifier("2026-11-11T00:00:00+03:00")).toBe(false);
    expect(isSochiQualifier("2026-11-10T21:00:00+00:00")).toBe(false);
    expect(isSochiQualifier("2026-11-14T19:00:00+03:00")).toBe(false);
  });

  it("says nothing of a start it cannot read", () => {
    expect(isSochiQualifier("")).toBe(false);
  });
});
