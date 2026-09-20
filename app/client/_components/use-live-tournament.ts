"use client";

import { useCallback, useEffect, useState } from "react";
import { getEffectiveTimerState, getLevelDuration } from "@/lib/timer/calculate";
import { toTimerState, type ClientLiveState, type LiveBlindLevel } from "@/lib/client-tma/live-state-shared";

/**
 * How often a phone asks the club whether anything moved.
 *
 * The countdown itself runs here, off the moment the level started, so this beat is
 * only about the things a player cannot work out on their own: somebody busting, the
 * desk pausing the clock, a new level being set. Half a minute is well inside what a
 * player would call "live", and twenty phones at it cost the database one read every
 * ten seconds — the server reuses a reading for everybody.
 */
const LIVE_PULSE_MS = 30_000;

/**
 * And how often it asks when there is no game on.
 *
 * The card cannot appear on its own if nobody is asking, so a phone open on a game day
 * keeps a slow watch for the tournament starting. Away from game days the screen asks
 * nothing at all.
 */
const IDLE_PULSE_MS = 60_000;

export type LiveTournament = {
  activePlayers: number;
  /** The level being played, counting breaks the way the room does. */
  currentLevel: LiveBlindLevel | null;
  isBreak: boolean;
  isPaused: boolean;
  nextLevel: LiveBlindLevel | null;
  registrationClosesAt: string | null;
  remainingSeconds: number;
  /** 1 for the first playing level; breaks do not take a number of their own. */
  roundNumber: number;
  totalPlayers: number;
  tournamentName: string;
};

function buildRoundNumber(levels: LiveBlindLevel[], currentIndex: number) {
  return levels.slice(0, currentIndex + 1).filter((level) => !level.isBreak).length;
}

/** What the phone should draw right now, given the state it holds and the clock. */
export function readLiveTournament(
  state: ClientLiveState | null,
  levels: LiveBlindLevel[],
  now: Date,
): LiveTournament | null {
  if (!state) return null;

  const { currentLevelIndex, remainingSeconds } = getEffectiveTimerState(
    toTimerState(state),
    levels,
    now,
  );
  const currentLevel = levels[currentLevelIndex] ?? null;

  return {
    activePlayers: state.activePlayers,
    currentLevel,
    isBreak: Boolean(currentLevel?.isBreak),
    isPaused: state.status === "paused",
    nextLevel: levels[currentLevelIndex + 1] ?? null,
    registrationClosesAt: state.registrationClosesAt,
    // A level the club has run past shows no time left rather than the whole level
    // again: the desk has not moved the clock on yet, and the room can see that.
    remainingSeconds: Math.min(remainingSeconds, getLevelDuration(currentLevel)),
    roundNumber: buildRoundNumber(levels, currentLevelIndex),
    totalPlayers: state.totalPlayers,
    tournamentName: state.tournamentName,
  };
}

/**
 * The game under way, kept current for as long as the player is looking at it.
 *
 * Nothing is asked of the club while the app is in the background — a phone in a pocket
 * costs the club nothing — and the clock catches up the moment it comes back. `enabled`
 * says whether a game could be starting; one that has already started is followed until
 * the desk finishes it.
 */
export function useLiveTournament({
  enabled,
  initData,
  initial = null,
}: {
  /** Whether a game could be on at all: away from game days nothing is asked. */
  enabled: boolean;
  initData: string;
  /** The reading the screen was served with, so the card is there on the first paint. */
  initial?: ClientLiveState | null;
}) {
  const [fetched, setFetched] = useState<ClientLiveState | null | undefined>(undefined);
  const [now, setNow] = useState(() => new Date());

  // Nothing has been fetched here yet: what the screen was served with still stands.
  const state = fetched === undefined ? initial : fetched;
  // Every reading kept here carries the grid it was read against — a beat that brings
  // no levels inherits the ones already held — so an empty grid means exactly one
  // thing: they have to be fetched.
  const levels = state?.blindLevels ?? [];

  const load = useCallback(async () => {
    try {
      const needsLevels = levels.length === 0;
      const response = await fetch(`/api/client-tma/live${needsLevels ? "?levels=1" : ""}`, {
        cache: "no-store",
        headers: { "X-Telegram-Init-Data": initData },
      });

      if (!response.ok) return;

      const { live } = (await response.json()) as { live: ClientLiveState | null };

      setFetched((previous) => {
        if (!live) return null;
        if (live.blindLevels) return live;

        const held = (previous === undefined ? initial : previous) ?? null;
        // The club edited the grid under us. Dropping it here is what asks for it: the
        // next beat sees no levels and fetches them.
        const blindLevels =
          held && held.levelsVersion === live.levelsVersion ? held.blindLevels : null;

        return { ...live, blindLevels };
      });
    } catch {
      // The next beat asks again. A card a few seconds stale beats an error on a phone.
    }
  }, [initData, initial, levels.length]);

  useEffect(() => {
    // A game already under way is followed to its finish, whatever the clock says: the
    // club plays past one in the morning, and what takes the card away is the desk
    // finishing the tournament, never the hour.
    if (!enabled && !state) return;

    // A phone in a pocket asks nothing; the clock is redrawn when the player comes back.
    const beat = () => {
      if (document.visibilityState === "visible") void load();
    };

    const timer = window.setInterval(beat, state ? LIVE_PULSE_MS : IDLE_PULSE_MS);
    document.addEventListener("visibilitychange", beat);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [enabled, load, state]);

  // The clock only ticks while there is a clock to draw.
  useEffect(() => {
    if (!state) return;

    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, [state]);

  return { live: readLiveTournament(state, levels, now), refresh: load };
}
