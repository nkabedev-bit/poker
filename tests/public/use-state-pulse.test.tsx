/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fullRefreshInterval,
  IDLE_FULL_REFRESH_INTERVAL_MS,
  IDLE_STATE_PULSE_INTERVAL_MS,
  isTournamentUnderway,
  LIVE_FULL_REFRESH_INTERVAL_MS,
  REFRESH_RETRY_MS,
  STATE_PULSE_INTERVAL_MS,
  STATE_PULSE_TIMEOUT_MS,
  statePulseInterval,
  useStatePulse,
} from "@/components/public/use-state-pulse";

const fetchMock = vi.fn();

// A fresh answer every beat: a response's body can be read only once.
function answer(version: string) {
  fetchMock.mockImplementation(async () => Response.json({ version }));
}

/** A request the network holds up: no answer, no error, until it is given up on. */
function hang() {
  fetchMock.mockImplementation(
    (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The request was given up on", "AbortError")),
        );
      }),
  );
}

function renderPulse(enabled: boolean, onScreen = "v1") {
  const refresh = vi.fn(async () => true);
  const versionRef = { current: onScreen as string | undefined };
  const hook = renderHook(
    (props: { enabled: boolean }) =>
      useStatePulse({ enabled: props.enabled, refresh, token: "token-1", versionRef }),
    { initialProps: { enabled } },
  );

  return { ...hook, refresh, versionRef };
}

describe("useStatePulse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks the club's own domain on every beat", async () => {
    answer("v1");
    renderPulse(true);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS * 3);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith("/api/public-state/token-1/pulse", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("leaves the screen alone while nothing has changed", async () => {
    answer("v1");
    const { refresh } = renderPulse(true);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS * 2);

    expect(refresh).not.toHaveBeenCalled();
  });

  // The draw started at the desk: the realtime signal was lost on the way.
  it("refreshes the screen as soon as the state has moved", async () => {
    answer("v2");
    const { refresh } = renderPulse(true);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh again once the screen has caught up", async () => {
    answer("v2");
    const { refresh, versionRef } = renderPulse(true);
    refresh.mockImplementation(async () => {
      versionRef.current = "v2";
      return true;
    });

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS * 3);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stays silent before the tournament starts and after it ends", async () => {
    answer("v2");
    renderPulse(false);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS * 3);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops asking once the tournament is over", async () => {
    answer("v1");
    const { rerender } = renderPulse(true);
    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS);

    rerender({ enabled: false });
    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS * 3);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps beating when an answer fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockResolvedValue(Response.json({ version: "v2" }));
    const { refresh } = renderPulse(true);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS * 2);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores an answer the server could not give", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Unable" }, { status: 500 }));
    const { refresh } = renderPulse(true);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS);

    expect(refresh).not.toHaveBeenCalled();
  });

  // A Russian ISP can hold a request without answering or refusing it; the screen must
  // not wait on it with the room's changes queuing up behind.
  it("gives up on an answer the network holds up and asks again on the next beat", async () => {
    hang();
    renderPulse(true);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS + STATE_PULSE_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS - STATE_PULSE_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Every try is a full read on the server: a lost refresh is not asked for on every beat.
  it("tries a refresh that did not arrive again only half a minute later", async () => {
    answer("v2");
    const { refresh } = renderPulse(true);
    refresh.mockResolvedValue(false);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS - STATE_PULSE_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("isTournamentUnderway", () => {
  // A draw is as likely in a break or a pause as in play.
  it("counts play, breaks and pauses as under way", () => {
    expect(isTournamentUnderway("running")).toBe(true);
    expect(isTournamentUnderway("break")).toBe(true);
    expect(isTournamentUnderway("paused")).toBe(true);
  });

  it("does not count the time before the start or after the finish", () => {
    expect(isTournamentUnderway("not_started")).toBe(false);
    expect(isTournamentUnderway("finished")).toBe(false);
  });
});

describe("useStatePulse — away from a game", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks once a minute when told to", async () => {
    answer("v1");
    renderHook(() =>
      useStatePulse({
        enabled: true,
        intervalMs: IDLE_STATE_PULSE_INTERVAL_MS,
        refresh: async () => true,
        token: "token-1",
        versionRef: { current: "v1" },
      }),
    );

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS * 5);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(IDLE_STATE_PULSE_INTERVAL_MS - STATE_PULSE_INTERVAL_MS * 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("statePulseInterval", () => {
  it("keeps a quick watch while a game is under way", () => {
    for (const status of ["running", "paused", "break"] as const) {
      expect(statePulseInterval(status, 0)).toBe(STATE_PULSE_INTERVAL_MS);
    }
  });

  // The desk registers players before the start; they have to reach the board at once.
  it("keeps a quick watch while players are being registered for the next game", () => {
    expect(statePulseInterval("not_started", 3)).toBe(STATE_PULSE_INTERVAL_MS);
  });

  it("slows to once a minute with nothing to watch", () => {
    expect(statePulseInterval("not_started", 0)).toBe(IDLE_STATE_PULSE_INTERVAL_MS);
    expect(statePulseInterval("finished", 30)).toBe(IDLE_STATE_PULSE_INTERVAL_MS);
  });
});

describe("fullRefreshInterval", () => {
  // A change that got past the pulse costs the room a minute at most.
  it("re-reads everything once a minute during a game", () => {
    for (const status of ["running", "paused", "break"] as const) {
      expect(fullRefreshInterval(status)).toBe(LIVE_FULL_REFRESH_INTERVAL_MS);
    }
  });

  it("re-reads everything once an hour away from a game", () => {
    expect(fullRefreshInterval("not_started")).toBe(IDLE_FULL_REFRESH_INTERVAL_MS);
    expect(fullRefreshInterval("finished")).toBe(IDLE_FULL_REFRESH_INTERVAL_MS);
  });
});
