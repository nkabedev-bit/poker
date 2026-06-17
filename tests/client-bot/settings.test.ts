import { describe, expect, it } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";

describe("client bot settings", () => {
  it("provides default client bot settings", () => {
    const extras = mergeTournamentExtras({});

    expect(extras.clientBot).toEqual({
      ratingUrl: "",
      registrationCode: "",
      scheduleText: "",
      scheduleVersions: [],
    });
  });

  it("merges stored client bot settings over defaults", () => {
    const extras = mergeTournamentExtras({
      clientBot: {
        ratingUrl: "https://docs.google.com/spreadsheets/d/example",
        registrationCode: "river",
        scheduleText: "Friday 20:00",
      },
    });

    expect(extras.clientBot).toEqual({
      ratingUrl: "https://docs.google.com/spreadsheets/d/example",
      registrationCode: "river",
      scheduleText: "Friday 20:00",
      scheduleVersions: [],
    });
  });
});
