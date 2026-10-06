"use client";

import { useEffect, useRef } from "react";
import { timeoutSignal } from "@/lib/timeout-signal";
import { useTMA } from "./layout";
import { TMA_DESK_CHANGED_EVENT } from "./tournament-clock";

/** How often an open admin screen asks whether anything has changed. */
export const TMA_POLL_INTERVAL_MS = 2000;

/** How often it reloads anyway, for whatever the fingerprint does not cover. */
export const TMA_FULL_REFRESH_MS = 60_000;

/**
 * How long a beat waits for the fingerprint. It is a few dozen bytes and comes back in
 * well under a second; one still out after this is held up on the way.
 */
export const TMA_PULSE_TIMEOUT_MS = 8000;

/**
 * While the fingerprint cannot be read, how often the screen reloads the old way. Not on
 * every beat: each reload is a full read on the server, and a network that loses the
 * fingerprint loses most of the reloads as well.
 */
export const TMA_UNREADABLE_RELOAD_MS = 30_000;

async function readVersion(initData: string) {
  try {
    const response = await fetch("/api/tma/pulse", {
      cache: "no-store",
      headers: { "X-Telegram-Init-Data": initData },
      signal: timeoutSignal(TMA_PULSE_TIMEOUT_MS),
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
 * Every two seconds it asks for a fingerprint of the state and reloads only when that has
 * moved, so a change made on another phone shows up almost at once. The reload swaps the
 * data in place — an open card, a search, a half-typed name stay as they are — so the
 * desk can keep working through it. Once a minute it reloads regardless, for anything the fingerprint does
 * not see, and while the fingerprint cannot be read it reloads every half minute rather
 * than go quiet. A fingerprint the network holds up is given up on after a few seconds,
 * so one lost answer cannot stop the beat.
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
        const sinceReload = Date.now() - reloadedAt;
        // The first answer reloads too: something may have changed between the screen's
        // own first read and this one.
        const moved = next !== null && next !== version;
        // The first answer only sets the mark: the header read the clock on its own
        // when the screen opened.
        const movedSinceSeen = moved && version !== null;
        const unreadable = next === null && sinceReload >= TMA_UNREADABLE_RELOAD_MS;
        const stale = sinceReload >= TMA_FULL_REFRESH_MS;
        // A lost answer leaves the last one standing: once the fingerprint comes back,
        // the screen reloads only if something moved while it was away.
        if (next !== null) version = next;

        if (moved || unreadable || stale) {
          reloadedAt = Date.now();
          callbackRef.current();
          // The clock in the header reads the timer on the same news, and only when
          // something actually moved: a scheduled reload changes nothing on it.
          if (movedSinceSeen) window.dispatchEvent(new Event(TMA_DESK_CHANGED_EVENT));
        }
      } finally {
        busy = false;
      }
    }, TMA_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [enabled, initData]);
}
