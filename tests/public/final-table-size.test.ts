/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { getFinalTableSize } from "@/components/public/public-screen";

describe("getFinalTableSize", () => {
  it("seats the final table the way tonight's tables are set", () => {
    expect(getFinalTableSize(9)).toBe(9);
    expect(getFinalTableSize(10)).toBe(10);
    expect(getFinalTableSize(6)).toBe(6);
  });

  it("falls back to ten-handed when the settings say nothing sensible", () => {
    expect(getFinalTableSize(undefined)).toBe(10);
    expect(getFinalTableSize(0)).toBe(10);
    expect(getFinalTableSize(12)).toBe(10);
  });
});
