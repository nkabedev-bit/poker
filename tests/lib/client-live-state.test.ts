import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearClientLiveStateCache,
  readClientLiveState,
  toTimerState,
} from "@/lib/client-tma/live-state";

function rpcResult(overrides: Record<string, unknown> = {}) {
  return {
    activePlayers: 10,
    blindLevels: null,
    currentLevelIndex: 2,
    levelStartedAt: "2026-09-20T15:30:00.000Z",
    levelsVersion: "18:2026-09-20T12:00:00.000Z",
    pausedRemainingSeconds: null,
    registrationClosesAt: "2026-09-20T18:00:00.000Z",
    status: "running",
    totalPlayers: 14,
    tournamentName: "Bounty Classic",
    ...overrides,
  };
}

function supabaseStub(data: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  return { client: { rpc } as never, rpc };
}

describe("readClientLiveState", () => {
  beforeEach(() => clearClientLiveStateCache());

  it("reads the game under way", async () => {
    const stub = supabaseStub(rpcResult());

    const live = await readClientLiveState(stub.client);

    expect(live).toMatchObject({ activePlayers: 10, totalPlayers: 14, tournamentName: "Bounty Classic" });
    expect(stub.rpc).toHaveBeenCalledWith("get_client_live_state", { p_include_levels: false });
  });

  // The card announces a game in progress; between games there is nothing to announce.
  it.each(["not_started", "finished"] as const)("says nothing while the room is %s", async (status) => {
    const stub = supabaseStub(rpcResult({ status }));

    expect(await readClientLiveState(stub.client)).toBeNull();
  });

  it("keeps showing the round through a break and a pause", async () => {
    for (const status of ["break", "paused"] as const) {
      clearClientLiveStateCache();
      const stub = supabaseStub(rpcResult({ status }));

      expect(await readClientLiveState(stub.client)).not.toBeNull();
    }
  });

  it("says there is no game when the club has no tournament at all", async () => {
    const stub = supabaseStub(null);

    expect(await readClientLiveState(stub.client)).toBeNull();
  });

  it("carries the blind grid only when it is asked for", async () => {
    const stub = supabaseStub(
      rpcResult({
        blindLevels: [
          {
            ante: 200,
            bigBlind: 400,
            breakDurationSeconds: null,
            durationSeconds: 1200,
            isBreak: false,
            levelOrder: 1,
            smallBlind: 200,
          },
        ],
      }),
    );

    const live = await readClientLiveState(stub.client, { includeLevels: true });

    expect(stub.rpc).toHaveBeenCalledWith("get_client_live_state", { p_include_levels: true });
    expect(live?.blindLevels).toHaveLength(1);
    expect(live?.blindLevels?.[0]).toMatchObject({ bigBlind: 400, durationSeconds: 1200 });
  });

  // Twenty phones in the room ask the same question; the database answers it once.
  it("serves the whole room from one reading for ten seconds", async () => {
    const stub = supabaseStub(rpcResult());

    await readClientLiveState(stub.client, { now: 1_000 });
    await readClientLiveState(stub.client, { now: 6_000 });

    expect(stub.rpc).toHaveBeenCalledTimes(1);

    await readClientLiveState(stub.client, { now: 11_001 });

    expect(stub.rpc).toHaveBeenCalledTimes(2);
  });

  it("answers a plain beat out of a reading that carried the levels", async () => {
    const stub = supabaseStub(rpcResult({ blindLevels: [] }));

    await readClientLiveState(stub.client, { includeLevels: true, now: 1_000 });
    await readClientLiveState(stub.client, { now: 2_000 });

    expect(stub.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not answer a request for levels out of a reading made without them", async () => {
    const stub = supabaseStub(rpcResult());

    await readClientLiveState(stub.client, { now: 1_000 });
    await readClientLiveState(stub.client, { includeLevels: true, now: 2_000 });

    expect(stub.rpc).toHaveBeenCalledTimes(2);
  });
});

describe("toTimerState", () => {
  it("hands the countdown the shape the screen's own clock uses", () => {
    const state = toTimerState({
      activePlayers: 4,
      blindLevels: null,
      currentLevelIndex: 3,
      levelStartedAt: "2026-09-20T15:30:00.000Z",
      levelsVersion: "18:",
      pausedRemainingSeconds: 42,
      registrationClosesAt: null,
      status: "paused",
      totalPlayers: 9,
      tournamentName: "Игра",
    });

    expect(state).toEqual({
      currentLevelIndex: 3,
      finishedAt: null,
      levelStartedAt: "2026-09-20T15:30:00.000Z",
      pausedRemainingSeconds: 42,
      registrationClosesAt: null,
      status: "paused",
    });
  });
});
