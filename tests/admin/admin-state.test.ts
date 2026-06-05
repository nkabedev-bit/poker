import { describe, expect, it } from "vitest";
import { mapAdminStateRpc } from "@/lib/admin/admin-state-mapper";

describe("mapAdminStateRpc", () => {
  it("maps Supabase RPC JSON into UI state", () => {
    const state = mapAdminStateRpc({
      tournament: {
        id: "tournament-1",
        name: "Friday Poker",
        logo_url: "/logo.png",
        starting_stack: 10000,
        registration_minutes: 180,
        registration_status: "open",
        public_token: "public-token",
      },
      timerState: {
        status: "running",
        current_level_index: 1,
        level_started_at: "2026-05-07T10:00:00.000Z",
        paused_remaining_seconds: null,
        registration_closes_at: "2026-05-07T13:00:00.000Z",
        finished_at: null,
      },
      blindLevels: [
        {
          id: "level-1",
          level_order: 1,
          small_blind: 25,
          big_blind: 50,
          ante: 0,
          reentry_closes: true,
          double_reentry_available: true,
          duration_seconds: 900,
          is_break: false,
          break_duration_seconds: null,
        },
      ],
      extras: {
        settings: {
          buyIn: 200,
        },
      },
    });

    expect(state.tournament).toEqual({
      id: "tournament-1",
      name: "Friday Poker",
      logoUrl: "/logo.png",
      startingStack: 10000,
      registrationMinutes: 180,
      registrationStatus: "open",
      publicToken: "public-token",
    });
    expect(state.timerState.currentLevelIndex).toBe(1);
    expect(state.blindLevels[0]).toEqual({
      id: "level-1",
      levelOrder: 1,
      smallBlind: 25,
      bigBlind: 50,
      ante: 0,
      reentryCloses: true,
      doubleReentryAvailable: true,
      durationSeconds: 900,
      isBreak: false,
      breakDurationSeconds: null,
    });
    expect(state.extras.settings.buyIn).toBe(200);
    expect(state.extras.prizes).toHaveLength(3);
  });

  it("defaults missing re-entry cutoff values to false", () => {
    const state = mapAdminStateRpc({
      tournament: {
        id: "tournament-1",
        name: "Friday Poker",
        logo_url: null,
        starting_stack: 10000,
        registration_minutes: 180,
        registration_status: "open",
        public_token: "public-token",
      },
      timerState: null,
      blindLevels: [
        {
          id: "level-1",
          level_order: 1,
          small_blind: 25,
          big_blind: 50,
          ante: 0,
          duration_seconds: 900,
          is_break: false,
          break_duration_seconds: null,
        },
      ],
      extras: {},
    });

    expect(state.blindLevels[0].reentryCloses).toBe(false);
    expect(state.blindLevels[0].doubleReentryAvailable).toBe(false);
  });
});
