/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { getSettledClockOffset } from "@/components/public/public-screen";

describe("getSettledClockOffset", () => {
  // The Date header counts whole seconds; taking every reading moved the countdown on
  // the wall a second either way on every change at the desk.
  it("keeps the clock when a refresh reads it within a second and a half", () => {
    expect(getSettledClockOffset(250, -700)).toBe(250);
    expect(getSettledClockOffset(250, 1_700)).toBe(250);
  });

  it("puts right a laptop clock that is really off", () => {
    expect(getSettledClockOffset(0, 120_000)).toBe(120_000);
    expect(getSettledClockOffset(5_000, -3_000)).toBe(-3_000);
  });
});
