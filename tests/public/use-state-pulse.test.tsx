/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTournamentUnderway,
  STATE_PULSE_INTERVAL_MS,
  useStatePulse,
} from "@/components/public/use-state-pulse";

const fetchMock = vi.fn();

function answer(version: string) {
  fetchMock.mockResolvedValue(Response.json({ version }));
}

function renderPulse(enabled: boolean, onScreen = "v1") {
  const refresh = vi.fn(async () => undefined);
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

  it("asks the club's own domain every ten seconds", async () => {
    answer("v1");
    renderPulse(true);

    await vi.advanceTimersByTimeAsync(STATE_PULSE_INTERVAL_MS * 3);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith("/api/public-state/token-1/pulse", {
      cache: "no-store",
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
