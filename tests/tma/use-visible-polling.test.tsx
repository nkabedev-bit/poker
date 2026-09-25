/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/tma/layout", () => ({ useTMA: () => ({ initData: "desk-init" }) }));

const { TMA_FULL_REFRESH_MS, TMA_POLL_INTERVAL_MS, useVisiblePolling } = await import(
  "@/app/tma/use-visible-polling"
);

const fetchMock = vi.fn();

function version(value: string) {
  fetchMock.mockImplementation(async () => Response.json({ version: value }));
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
}

describe("useVisiblePolling — the desk's screens", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks for the fingerprint, not the whole tournament, every five seconds", async () => {
    version("v1");
    renderHook(() => useVisiblePolling(() => undefined));

    await vi.advanceTimersByTimeAsync(TMA_POLL_INTERVAL_MS * 3);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith("/api/tma/pulse", {
      cache: "no-store",
      headers: { "X-Telegram-Init-Data": "desk-init" },
    });
  });

  it("reloads once on the first answer, then only when something has changed", async () => {
    version("v1");
    const reload = vi.fn();
    renderHook(() => useVisiblePolling(reload));

    await vi.advanceTimersByTimeAsync(TMA_POLL_INTERVAL_MS * 4);
    expect(reload).toHaveBeenCalledTimes(1);

    // Another phone at the desk registers a player.
    version("v2");
    await vi.advanceTimersByTimeAsync(TMA_POLL_INTERVAL_MS);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("reloads once a minute regardless, for whatever the fingerprint does not see", async () => {
    version("v1");
    const reload = vi.fn();
    renderHook(() => useVisiblePolling(reload));

    await vi.advanceTimersByTimeAsync(TMA_FULL_REFRESH_MS + TMA_POLL_INTERVAL_MS);

    expect(reload).toHaveBeenCalledTimes(2);
  });

  // A pulse that cannot be read must not leave the desk looking at an old roster.
  it("reloads the old way when the fingerprint cannot be read", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 500 }));
    const reload = vi.fn();
    renderHook(() => useVisiblePolling(reload));

    await vi.advanceTimersByTimeAsync(TMA_POLL_INTERVAL_MS * 3);

    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("asks nothing while the screen is hidden", async () => {
    version("v1");
    setVisibility("hidden");
    const reload = vi.fn();
    renderHook(() => useVisiblePolling(reload));

    await vi.advanceTimersByTimeAsync(TMA_POLL_INTERVAL_MS * 3);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("asks nothing while switched off", async () => {
    version("v1");
    renderHook(() => useVisiblePolling(() => undefined, false));

    await vi.advanceTimersByTimeAsync(TMA_POLL_INTERVAL_MS * 3);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
