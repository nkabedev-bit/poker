import { describe, expect, it } from "vitest";
import { blindPresets } from "@/lib/timer/presets";

describe("blindPresets", () => {
  it("uses requested level durations", () => {
    expect(blindPresets.turbo.every((level) => level.durationSeconds === 600)).toBe(true);
    expect(blindPresets.standard.every((level) => level.durationSeconds === 900)).toBe(true);
    expect(blindPresets.deep.every((level) => level.durationSeconds === 1500)).toBe(true);
  });
});
