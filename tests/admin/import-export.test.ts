import { describe, expect, it } from "vitest";
import {
  buildTournamentExportPayload,
  parseTournamentImportPayload,
} from "@/lib/admin/import-export";
import { defaultTournamentExtras } from "@/lib/tournament-extras-shared";
import type { PublicTournamentState } from "@/lib/timer/types";

const baseState: PublicTournamentState = {
  tournament: {
    id: "tournament-1",
    logoUrl: "https://example.com/logo.png",
    name: "Friday Poker",
    publicToken: "public-token",
    registrationMinutes: 90,
    registrationStatus: "open",
    startingStack: 25000,
  },
  timerState: {
    currentLevelIndex: 2,
    finishedAt: null,
    levelStartedAt: "2026-05-17T10:00:00.000Z",
    pausedRemainingSeconds: null,
    registrationClosesAt: "2026-05-17T11:30:00.000Z",
    status: "running",
  },
  blindLevels: [
    {
      ante: 25,
      bigBlind: 200,
      breakDurationSeconds: null,
      durationSeconds: 900,
      id: "level-1",
      isBreak: false,
      levelOrder: 1,
      reentryCloses: true,
      smallBlind: 100,
    },
  ],
  extras: {
    ...defaultTournamentExtras,
    blindTemplates: [
      {
        id: "template-1",
        name: "Deep",
        levels: [
          {
            ante: 25,
            bigBlind: 200,
            breakDurationSeconds: null,
            durationSeconds: 900,
            isBreak: false,
            levelOrder: 1,
            reentryCloses: true,
            smallBlind: 100,
          },
        ],
      },
    ],
    clientBot: {
      ratingUrl: "https://example.com/rating",
      registrationCode: "FRIDAY",
      scheduleText: "Every Friday",
      scheduleVersions: [],
    },
    players: [
      {
        addons: 1,
        addonChipsTotal: 15000,
        bountyCount: 2,
        finishPlace: null,
        id: "player-1",
        name: "Alice",
        registeredVia: "admin",
        rebuys: 1,
        seat: 1,
        stack: 50000,
        status: "active",
        table: 1,
      },
    ],
    prizes: [
      { place: 1, bonuses: ["Ticket"] },
      { place: 2, bonuses: ["Cash"] },
    ],
    pts: {
      ...defaultTournamentExtras.pts,
      bountyPoints: 7,
      enabled: true,
      placePoints: [100, 60, 30],
    },
    settings: {
      ...defaultTournamentExtras.settings,
      addonChips: 20000,
      addonEnabled: true,
      addonMinutes: 120,
      addonPrice: 150,
      blindAlertCustomSoundName: "bell.mp3",
      blindAlertCustomSoundUrl: "https://example.com/bell.mp3",
      blindAlertSeconds: 15,
      blindAlertSound: "custom",
      buyIn: 300,
      isBounty: true,
      maxAddons: 2,
      maxPlayersPerTable: 8,
      maxReentries: 3,
      rebuyPrice: 200,
      reentryEnabled: true,
      tablesCount: 4,
    },
  },
};

describe("admin tournament import/export payload", () => {
  it("exports all non-player tournament settings", () => {
    const payload = buildTournamentExportPayload(baseState, "2026-05-17T12:00:00.000Z");

    expect(payload.extras.settings).toEqual(baseState.extras.settings);
    expect(payload.extras.blindTemplates).toEqual(baseState.extras.blindTemplates);
    expect(payload.extras.clientBot).toEqual(baseState.extras.clientBot);
    expect(payload.extras.prizes).toEqual(baseState.extras.prizes);
    expect(payload.extras.pts).toEqual(baseState.extras.pts);
    expect("players" in payload.extras).toBe(false);
  });

  it("parses import files without players and resets antes", () => {
    const payload = buildTournamentExportPayload(baseState, "2026-05-17T12:00:00.000Z");
    const parsed = parseTournamentImportPayload(payload);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    // Session-tracking fields are runtime state, not config, so they are
    // intentionally not round-tripped through import (absent from settingsSchema).
    const { sheetsSessionStartedAt, statsCountedAt, ...importableSettings } =
      baseState.extras.settings;
    void sheetsSessionStartedAt;
    void statsCountedAt;
    expect(parsed.data.extrasPatch.settings).toEqual(importableSettings);
    expect(parsed.data.extrasPatch.players).toBeUndefined();
    expect(parsed.data.blindLevels[0].ante).toBe(0);
  });
});
