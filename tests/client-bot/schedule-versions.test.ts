import { describe, expect, it } from "vitest";
import { mergeTournamentExtras, pickActiveScheduleText } from "@/lib/tournament-extras-shared";

describe("schedule versions", () => {
  it("defaults scheduleVersions to empty array", () => {
    expect(mergeTournamentExtras({}).clientBot.scheduleVersions).toEqual([]);
  });

  it("drops invalid versions and sorts by date asc", () => {
    const extras = mergeTournamentExtras({
      clientBot: {
        scheduleVersions: [
          { effectiveFrom: "2026-07-01T00:00:00Z", text: "july" },
          { effectiveFrom: "bad", text: "x" },
          { effectiveFrom: "2026-06-01T00:00:00Z", text: "june" },
          { effectiveFrom: "2026-08-01T00:00:00Z", text: "" },
        ],
      },
    } as unknown);
    expect(extras.clientBot.scheduleVersions.map((v) => v.text)).toEqual(["june", "july"]);
  });

  it("falls back to scheduleText when no version is active", () => {
    const cb = {
      scheduleText: "base",
      scheduleVersions: [{ effectiveFrom: "2099-01-01T00:00:00Z", text: "future" }],
    };
    expect(pickActiveScheduleText(cb, new Date("2026-06-18T00:00:00Z"))).toBe("base");
  });

  it("picks latest version with effectiveFrom <= now", () => {
    const cb = {
      scheduleText: "base",
      scheduleVersions: [
        { effectiveFrom: "2026-06-01T00:00:00Z", text: "june" },
        { effectiveFrom: "2026-06-15T00:00:00Z", text: "mid-june" },
        { effectiveFrom: "2099-01-01T00:00:00Z", text: "future" },
      ],
    };
    expect(pickActiveScheduleText(cb, new Date("2026-06-18T00:00:00Z"))).toBe("mid-june");
  });
});
