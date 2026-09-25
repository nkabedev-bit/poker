"use client";

import { useEffect, type RefObject } from "react";
import { isTournamentUnderway } from "@/lib/timer/calculate";
import type { TimerStatus } from "@/lib/timer/types";

/**
 * How often a screen asks whether anything has changed: every ten seconds while a
 * tournament is on or players are being registered for one, once a minute otherwise.
 */
export const STATE_PULSE_INTERVAL_MS = 10_000;
export const IDLE_STATE_PULSE_INTERVAL_MS = 60_000;

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
 * Keeps the screen in step with the room while a tournament is under way.
 *
 * Screens hear about changes over a realtime channel on supabase.co, which Russian ISPs
 * cut through Cloudflare: a draw started at the desk could reach the hall only on the
 * 45-second poll. Every ten seconds this asks the club's own domain for a fingerprint
 * of the state and refreshes the screen only when it has moved, so a missed signal
 * costs seconds rather than most of a minute, and a quiet room costs a few bytes.
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
  refresh: () => Promise<void>;
  token: string;
  versionRef: RefObject<string | undefined>;
}) {
  useEffect(() => {
    if (!enabled) return;

    let busy = false;
    const pulse = window.setInterval(async () => {
      // A slow answer is not asked again on top of itself.
      if (busy) return;
      busy = true;

      try {
        const response = await fetch(`/api/public-state/${token}/pulse`, { cache: "no-store" });
        if (!response.ok) return;

        const { version } = (await response.json()) as { version?: unknown };
        if (typeof version !== "string" || version === versionRef.current) return;

        await refresh();
      } catch {
        // The next beat asks again; the realtime channel and the slow poll still stand.
      } finally {
        busy = false;
      }
    }, intervalMs);

    return () => window.clearInterval(pulse);
  }, [enabled, intervalMs, refresh, token, versionRef]);
}
