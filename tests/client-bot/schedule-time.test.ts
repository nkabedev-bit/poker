import { describe, expect, it } from "vitest";
import { moscowLocalToUtcISO, utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";

describe("schedule time (Europe/Moscow +03:00)", () => {
  it("converts moscow wall time to UTC ISO", () => {
    expect(moscowLocalToUtcISO("2026-06-19T14:00")).toBe("2026-06-19T11:00:00.000Z");
  });

  it("formats UTC ISO back to moscow datetime-local", () => {
    expect(utcISOToMoscowLocal("2026-06-19T11:00:00.000Z")).toBe("2026-06-19T14:00");
  });

  it("round-trips", () => {
    const local = "2026-12-31T23:30";
    expect(utcISOToMoscowLocal(moscowLocalToUtcISO(local))).toBe(local);
  });
});
