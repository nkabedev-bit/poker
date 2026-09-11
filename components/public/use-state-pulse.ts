"use client";

import { useEffect, type RefObject } from "react";
import type { TimerStatus } from "@/lib/timer/types";

/** How often a screen with a tournament under way asks whether anything has changed. */
export const STATE_PULSE_INTERVAL_MS = 10_000;

/**
 * A tournament is under way from the first level to the finish, breaks and pauses
 * included — a draw is as likely to be run in a break as during play.
 */
export function isTournamentUnderway(status: TimerStatus) {
  return status === "running" || status === "paused" || status === "break";
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
  refresh,
  token,
  versionRef,
}: {
  enabled: boolean;
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
    }, STATE_PULSE_INTERVAL_MS);

    return () => window.clearInterval(pulse);
  }, [enabled, refresh, token, versionRef]);
}
