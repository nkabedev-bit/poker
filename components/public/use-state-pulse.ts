"use client";

import { useEffect, type RefObject } from "react";
import { timeoutSignal } from "@/lib/timeout-signal";
import { isTournamentUnderway } from "@/lib/timer/calculate";
import type { TimerStatus } from "@/lib/timer/types";

/**
 * How often a screen asks whether anything has changed: every five seconds while a
 * tournament is on or players are being registered for one, every half minute otherwise.
 * Changes reach the screen at once over realtime; this only catches a missed signal.
 */
export const STATE_PULSE_INTERVAL_MS = 5_000;
export const IDLE_STATE_PULSE_INTERVAL_MS = 30_000;

/**
 * How long a beat waits for its answer. A fingerprint is a few dozen bytes and comes back
 * in well under a second; one still out after this is held up on the way.
 */
export const STATE_PULSE_TIMEOUT_MS = 4_000;

/**
 * How soon a refresh that did not arrive is tried again. Not on the next beat: every try
 * is a full read on the server, and a connection that lost one refresh loses the next
 * one too.
 */
export const REFRESH_RETRY_MS = 10_000;

/**
 * How often the screen re-reads its whole state whatever the pulse says: once a minute
 * during a game, for a change that got past the pulse, and every five minutes otherwise.
 */
export const LIVE_FULL_REFRESH_INTERVAL_MS = 60_000;
export const IDLE_FULL_REFRESH_INTERVAL_MS = 5 * 60_000;

// Lives with the rest of the clock now that the client app asks the same question;
// re-exported so the screen's imports stay where they were.
export { isTournamentUnderway } from "@/lib/timer/calculate";

/**
 * How often a screen asks: quickly while the room has something to watch — a game under
 * way, or players being registered for the next one, who have to reach the board as the
 * desk types them in — and once a minute otherwise, which still catches the evening's
 * first registration soon.
 */
export function statePulseInterval(status: TimerStatus, registeredPlayers: number) {
  const live =
    isTournamentUnderway(status) || (status === "not_started" && registeredPlayers > 0);

  return live ? STATE_PULSE_INTERVAL_MS : IDLE_STATE_PULSE_INTERVAL_MS;
}

/**
 * How often the screen re-reads everything regardless of the pulse.
 *
 * The pulse can only see what its fingerprint covers, so during a game the screen also
 * re-reads itself once a minute, and every five minutes away from a game.
 */
export function fullRefreshInterval(status: TimerStatus) {
  return isTournamentUnderway(status)
    ? LIVE_FULL_REFRESH_INTERVAL_MS
    : IDLE_FULL_REFRESH_INTERVAL_MS;
}

/**
 * Keeps the screen in step with the room while a tournament is under way.
 *
 * Screens hear about changes over the realtime channel on the club's own server, within
 * a fraction of a second. As a safety net, every five seconds this asks for a fingerprint
 * of the state and refreshes the screen only when it has moved, so a missed signal costs
 * a few seconds and a quiet room costs a few bytes.
 *
 * A request the network holds up is given up on after a few seconds, so one lost answer
 * cannot stop the beat: without that, a single held request kept the screen still for as
 * long as the browser waited on it.
 *
 * `versionRef` holds the fingerprint of the state on screen; the refresh keeps it
 * current, whatever triggered it.
 */
export function useStatePulse({
  enabled,
  intervalMs = STATE_PULSE_INTERVAL_MS,
  refresh,
  token,
  versionRef,
}: {
  enabled: boolean;
  intervalMs?: number;
  /** Re-reads the whole state; resolves true once it has arrived. */
  refresh: () => Promise<boolean>;
  token: string;
  versionRef: RefObject<string | undefined>;
}) {
  useEffect(() => {
    if (!enabled) return;

    let busy = false;
    let retryAt = 0;
    const pulse = window.setInterval(async () => {
      // A slow answer is not asked again on top of itself.
      if (busy) return;
      busy = true;

      try {
        const response = await fetch(`/api/public-state/${token}/pulse`, {
          cache: "no-store",
          signal: timeoutSignal(STATE_PULSE_TIMEOUT_MS),
        });
        if (!response.ok) return;

        const { version } = (await response.json()) as { version?: unknown };
        if (typeof version !== "string" || version === versionRef.current) return;
        if (Date.now() < retryAt) return;

        const arrived = await refresh();
        retryAt = arrived ? 0 : Date.now() + REFRESH_RETRY_MS;
      } catch {
        // The next beat asks again; the realtime channel and the slow poll still stand.
      } finally {
        busy = false;
      }
    }, intervalMs);

    return () => window.clearInterval(pulse);
  }, [enabled, intervalMs, refresh, token, versionRef]);
}
