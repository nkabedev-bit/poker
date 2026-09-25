"use client";

import { useEffect, useRef } from "react";
import { useTMA } from "./layout";

/** How often an open admin screen asks whether anything has changed. */
export const TMA_POLL_INTERVAL_MS = 5000;

/** How often it reloads anyway, for whatever the fingerprint does not cover. */
export const TMA_FULL_REFRESH_MS = 60_000;

async function readVersion(initData: string) {
  try {
    const response = await fetch("/api/tma/pulse", {
      cache: "no-store",
      headers: { "X-Telegram-Init-Data": initData },
    });
    if (!response.ok) return null;

    const { version } = (await response.json()) as { version?: unknown };
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * Keeps an open admin screen in step with the room.
 *
 * It used to reload the whole tournament every five seconds while the screen was on —
 * thousands of full reads a game night from every phone at the desk, the largest part of
 * the club's server time. Every five seconds it now asks for a fingerprint of the state
 * and reloads only when that has moved, so a change made on another phone still shows up
 * within seconds. Once a minute it reloads regardless, for anything the fingerprint does
 * not see, and a pulse that cannot be read reloads the old way rather than go quiet.
 *
 * Nothing is asked while the screen is hidden.
 */
export function useVisiblePolling(callback: () => void, enabled = true) {
  const { initData } = useTMA();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;

    let version: string | null = null;
    let reloadedAt = Date.now();
    let busy = false;

    const interval = window.setInterval(async () => {
      // A slow answer is not asked again on top of itself.
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;

      try {
        const next = await readVersion(initData);
        const stale = Date.now() - reloadedAt >= TMA_FULL_REFRESH_MS;
        // The first answer reloads too: something may have changed between the screen's
        // own first read and this one.
        const moved = next === null || next !== version;
        version = next;

        if (moved || stale) {
          reloadedAt = Date.now();
          callbackRef.current();
        }
      } finally {
        busy = false;
      }
    }, TMA_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [enabled, initData]);
}
